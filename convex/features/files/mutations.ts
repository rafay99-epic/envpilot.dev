import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, internalMutation } from "../../_generated/server";
import {
  checkBooleanFeature,
  checkCountedLimit,
  checkNumericLimit,
  countActiveFiles,
} from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";
import { createAuditLog } from "../../lib/audit";
import { requireAuthedUser } from "../../lib/identity";
import { authorizeFileAccess, requireFileAccess } from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import {
  isEnvironmentScopeAllowed,
  getRoleProfile,
  hasCapability,
} from "../../lib/authz";
import {
  findFilePathConflicts,
  filePathConflictMessage,
  normalizeFileMode,
  normalizeFileName,
  normalizeFilePath,
} from "./helpers";

/**
 * Secret File Mutations
 *
 * A secret file is a project-scoped binary/text artifact — a keystore, an SSH
 * key, a service-account JSON — whose ciphertext lives in Convex file storage
 * and whose AES data key lives in WorkOS Vault. Convex stores only the two
 * references plus non-secret metadata. RBAC, environment scoping, and
 * per-file viewer sharing mirror projectAccounts exactly.
 *
 * These mutations never see plaintext: the composing actions in values.ts do
 * the encryption and hand down only `storageId` + `vaultRef` + digest.
 */

/**
 * Throw when a scoped developer touches environments outside their scope.
 * No-op for unrestricted (undefined) scopes — see authz.ts.
 */
function assertWithinEnvironmentScope(
  scope: string[] | undefined,
  environments: string[]
): void {
  if (!isEnvironmentScopeAllowed(scope, environments)) {
    throw new ConvexError(
      `Your access is limited to these environments: ${(scope ?? []).join(", ")}`
    );
  }
}

/**
 * Gate a prospective upload BEFORE any encryption or storage write happens.
 *
 * Called by values.uploadFile as its own step so that a tier denial, a scope
 * violation, or a path clash costs zero vault objects and zero orphaned
 * blobs. Returns the normalized values the caller must then persist, so the
 * normalization cannot drift between the check and the insert.
 */
export const preflightUpload = internalMutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    name: v.string(),
    path: v.string(),
    mode: v.optional(v.string()),
    environments: v.array(v.string()),
    size: v.number(),
    // Present when replacing an existing file's contents.
    replaceFileId: v.optional(v.id("projectFiles")),
  },
  returns: v.object({
    name: v.string(),
    path: v.string(),
    mode: v.string(),
    organizationId: v.id("organizations"),
  }),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const name = normalizeFileName(args.name);
    const path = normalizeFilePath(args.path);
    const mode = normalizeFileMode(args.mode);

    if (args.environments.length === 0) {
      throw new ConvexError("A file must have at least one environment");
    }
    if (args.size <= 0) {
      throw new ConvexError("File is empty");
    }

    if (args.replaceFileId) {
      const existing = await ctx.db.get(args.replaceFileId);
      if (!existing || existing.deletedAt) {
        throw new ConvexError("File not found");
      }
      // The file being replaced MUST belong to the project whose org supplies
      // the vault key context below. Without this, a caller with write access
      // in two projects could replace project B's file while the new vault
      // object is created under project A's key context — the ref would
      // resolve, but the object would sit in the wrong cryptographic scope.
      if (existing.projectId !== args.projectId) {
        throw new ConvexError("File does not belong to this project");
      }
      await requireFileAccess(ctx, args.userId, existing, "write", project);
    } else {
      // Capability: project.files.create (assignment-gated)
      const { environmentScope } = await authorizeFileAccess(ctx, {
        userId: args.userId,
        projectId: args.projectId,
        action: "project:create_file",
        preloadedProject: project,
      });
      assertWithinEnvironmentScope(environmentScope, args.environments);
    }

    // Resolve the shared org/tier/grace context once for all three gates.
    const gate = await resolveOrgGateContext(ctx.db, project.organizationId);

    const boolGate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secret_files",
      gate
    );
    if (!boolGate.allowed) {
      throw new ConvexError(
        boolGate.reason ?? "Secret files are not enabled for your tier."
      );
    }

    // Byte limit before count limit: a single oversized upload should say so
    // rather than blaming the file count.
    //
    // Resolve the limit with a zero count and compare the size HERE, rather
    // than passing the size as the count. checkNumericLimit answers
    // "current < limit", which is right for "how many do I already have" but
    // off by one for a size: a file of exactly the limit would be rejected by
    // a limit that claims to allow it.
    const byteGate = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "secret_files_max_bytes",
      0,
      gate
    );
    if (byteGate.limit !== null && args.size > byteGate.limit) {
      throw new ConvexError(
        `File is too large (${Math.ceil(args.size / 1024)} KB). Your plan allows up to ${Math.floor(
          byteGate.limit / 1024
        )} KB per file.`
      );
    }

    // A replace consumes no new slot — only new files count against the cap.
    if (!args.replaceFileId) {
      const countGate = await checkCountedLimit(
        ctx.db,
        project.organizationId,
        "secret_files_limit",
        (limit) => countActiveFiles(ctx.db, project.organizationId, limit),
        gate
      );
      if (!countGate.allowed) {
        throw new ConvexError(
          countGate.reason ??
            `Secret file limit reached (${countGate.current}/${countGate.limit}). Upgrade your tier for more.`
        );
      }
    }

    // Path uniqueness LAST but still before the caller encrypts anything.
    const clashes = await findFilePathConflicts(ctx, {
      projectId: args.projectId,
      path,
      environments: args.environments,
      excludeFileId: args.replaceFileId,
    });
    if (clashes.length > 0) {
      throw new ConvexError(filePathConflictMessage(path, clashes));
    }

    return { name, path, mode, organizationId: project.organizationId };
  },
});

/**
 * Persist a freshly-encrypted file. Called by values.uploadFile AFTER the
 * blob and vault objects exist; on failure the action deletes both.
 *
 * Re-runs the path-conflict check: preflight ran before the (slow) encrypt,
 * so a concurrent upload could have taken the path in between.
 */
export const create = internalMutation({
  args: {
    projectId: v.id("projects"),
    createdBy: v.id("users"),
    name: v.string(),
    path: v.string(),
    mode: v.string(),
    contentType: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    size: v.number(),
    sha256: v.string(),
    digestSalt: v.string(),
    vaultRef: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.id("projectFiles"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const { environmentScope, profile: creatorProfile } =
      await authorizeFileAccess(ctx, {
        userId: args.createdBy,
        projectId: args.projectId,
        action: "project:create_file",
        preloadedProject: project,
      });
    assertWithinEnvironmentScope(environmentScope, args.environments);

    const clashes = await findFilePathConflicts(ctx, {
      projectId: args.projectId,
      path: args.path,
      environments: args.environments,
    });
    if (clashes.length > 0) {
      throw new ConvexError(filePathConflictMessage(args.path, clashes));
    }

    // Re-check the tier gates INSIDE the transaction. preflight runs before
    // the (slow) encrypt, so the tier can be downgraded, the feature can be
    // switched off, or a concurrent upload can consume the last slot while
    // the bytes are in flight. The action already destroys the blob and
    // vault object when this mutation rejects, so refusing here is free.
    const insertGate = await resolveOrgGateContext(
      ctx.db,
      project.organizationId
    );

    const insertBoolGate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secret_files",
      insertGate
    );
    if (!insertBoolGate.allowed) {
      throw new ConvexError(
        insertBoolGate.reason ?? "Secret files are not enabled for your tier."
      );
    }

    const insertByteGate = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "secret_files_max_bytes",
      0,
      insertGate
    );
    if (insertByteGate.limit !== null && args.size > insertByteGate.limit) {
      throw new ConvexError(
        `File is too large (${Math.ceil(args.size / 1024)} KB). Your plan allows up to ${Math.floor(
          insertByteGate.limit / 1024
        )} KB per file.`
      );
    }

    const countGate = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "secret_files_limit",
      (limit) => countActiveFiles(ctx.db, project.organizationId, limit),
      insertGate
    );
    if (!countGate.allowed) {
      throw new ConvexError(
        countGate.reason ??
          `Secret file limit reached (${countGate.current}/${countGate.limit}). Upgrade your tier for more.`
      );
    }

    const fileId = await ctx.db.insert("projectFiles", {
      name: args.name,
      path: args.path,
      mode: args.mode,
      contentType: args.contentType,
      size: args.size,
      sha256: args.sha256,
      digestSalt: args.digestSalt,
      vaultRef: args.vaultRef,
      storageId: args.storageId,
      description: args.description,
      environments: args.environments,
      projectId: args.projectId,
      createdBy: args.createdBy,
      lastModifiedBy: args.createdBy,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Uploaders WITHOUT blanket write get an automatic write grant, so a
    // developer can manage the file they just added (parity with accounts).
    if (!hasCapability(creatorProfile, "project.files.update")) {
      await ctx.db.insert("filePermissions", {
        fileId,
        userId: args.createdBy,
        permission: "write",
        grantedBy: args.createdBy,
        grantedAt: now,
        isActive: true,
      });
    }

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.createdBy,
      action: "file.created",
      details: {
        fileId,
        fileName: args.name,
        path: args.path,
        size: args.size,
        environments: args.environments,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return fileId;
  },
});

/**
 * Point a file at a NEW blob + vault ref after a content replace, and return
 * the previous pair so the action can destroy it.
 *
 * A replace is never an in-place re-encrypt: values.uploadFile seals fresh
 * key material into a fresh blob, and only then does this swap the pointers.
 * That is what makes nonce reuse unreachable.
 */
export const replaceContent = internalMutation({
  args: {
    fileId: v.id("projectFiles"),
    userId: v.id("users"),
    size: v.number(),
    sha256: v.string(),
    digestSalt: v.string(),
    vaultRef: v.string(),
    storageId: v.id("_storage"),
    contentType: v.optional(v.string()),
  },
  returns: v.object({
    previousVaultRef: v.string(),
    previousStorageId: v.id("_storage"),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await requireFileAccess(ctx, args.userId, file, "write", project);

    const previousVaultRef = file.vaultRef;
    const previousStorageId = file.storageId;
    const newVersion = file.version + 1;

    await ctx.db.patch(args.fileId, {
      size: args.size,
      sha256: args.sha256,
      digestSalt: args.digestSalt,
      vaultRef: args.vaultRef,
      storageId: args.storageId,
      contentType: args.contentType ?? file.contentType,
      version: newVersion,
      lastModifiedBy: args.userId,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId: args.userId,
      action: "file.updated",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        path: file.path,
        newVersion,
        previousVersion: file.version,
        contentReplaced: true,
        size: args.size,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return { previousVaultRef, previousStorageId };
  },
});

/**
 * Remove ONE environment from a file, atomically.
 *
 * Deliberately not `update({environments})`: a client computing the new array
 * from a listing it fetched moments earlier overwrites whatever another user
 * changed in between — including re-adding the environment they just
 * detached. The environment to drop is the only thing the caller sends; the
 * surviving set is derived from the row inside the transaction.
 *
 * Refuses to empty the array. A file belonging to no environment is
 * invisible to every environment-filtered read while still occupying its
 * path — delete it instead.
 */
export const detachEnvironment = mutation({
  args: {
    fileId: v.id("projectFiles"),
    environment: v.string(),
  },
  returns: v.object({
    remaining: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const userId = (await requireAuthedUser(ctx))._id;

    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await requireFileAccess(ctx, userId, file, "write", project);

    if (!file.environments.includes(args.environment)) {
      throw new ConvexError(
        `"${file.path}" is not in ${args.environment} — nothing to remove`
      );
    }
    const remaining = file.environments.filter((e) => e !== args.environment);
    if (remaining.length === 0) {
      throw new ConvexError(
        `"${file.path}" belongs only to ${args.environment}. Delete the file instead of leaving it with no environment.`
      );
    }

    await ctx.db.patch(args.fileId, {
      environments: remaining,
      version: file.version + 1,
      lastModifiedBy: userId,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId,
      action: "file.updated",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        path: file.path,
        detachedEnvironment: args.environment,
        environments: remaining,
        previousVersion: file.version,
        newVersion: file.version + 1,
      },
      resourceType: "file",
    });

    return { remaining };
  },
});

/** Metadata-only edit. Never touches the blob or the vault object. */
export const update = mutation({
  args: {
    fileId: v.id("projectFiles"),
    name: v.optional(v.string()),
    path: v.optional(v.string()),
    mode: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
  },
  returns: v.id("projectFiles"),
  handler: async (ctx, args) => {
    const now = Date.now();
    // Actor comes from the verified JWT, NEVER from an argument: this
    // mutation is callable directly by the browser, so a client-supplied
    // userId would let any member act as anyone else.
    const userId = (await requireAuthedUser(ctx))._id;
    const { fileId, ...updates } = args;

    const file = await ctx.db.get(fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await requireFileAccess(ctx, userId, file, "write", project);

    const nextEnvironments = updates.environments ?? file.environments;
    const nextPath =
      updates.path !== undefined ? normalizeFilePath(updates.path) : file.path;

    if (updates.environments !== undefined) {
      if (updates.environments.length === 0) {
        throw new ConvexError("A file must have at least one environment");
      }

      // A scoped developer must not move a file INTO an out-of-scope
      // environment, even though getFileAccess already blocked out-of-scope
      // files from reaching here (mirror of accounts.update).
      const editorMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", project.organizationId).eq("userId", userId)
        )
        .first();

      const updaterProfile = editorMembership
        ? await getRoleProfile(ctx, editorMembership.role)
        : null;
      if (
        updaterProfile &&
        hasCapability(updaterProfile, "access.env_scoped")
      ) {
        const editorAssignment = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", file.projectId).eq("userId", userId)
          )
          .first();

        assertWithinEnvironmentScope(
          editorAssignment?.environments,
          updates.environments
        );
      }
    }

    // Re-check uniqueness whenever the (path, environments) pair moves.
    if (updates.path !== undefined || updates.environments !== undefined) {
      const clashes = await findFilePathConflicts(ctx, {
        projectId: file.projectId,
        path: nextPath,
        environments: nextEnvironments,
        excludeFileId: fileId,
      });
      if (clashes.length > 0) {
        throw new ConvexError(filePathConflictMessage(nextPath, clashes));
      }
    }

    const newVersion = file.version + 1;
    const updateData: Record<string, unknown> = {
      updatedAt: now,
      lastModifiedBy: userId,
      version: newVersion,
    };

    if (updates.name !== undefined)
      updateData.name = normalizeFileName(updates.name);
    if (updates.path !== undefined) updateData.path = nextPath;
    if (updates.mode !== undefined)
      updateData.mode = normalizeFileMode(updates.mode);
    // An empty string clears the optional field: Convex treats an explicit
    // `undefined` in a patch as field removal.
    if (updates.description !== undefined)
      updateData.description =
        updates.description === "" ? undefined : updates.description;
    if (updates.environments !== undefined)
      updateData.environments = updates.environments;

    await ctx.db.patch(fileId, updateData);

    const fieldsUpdated = Object.keys(updates).filter(
      (k) => updates[k as keyof typeof updates] !== undefined
    );

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId,
      action: "file.updated",
      details: {
        fileId,
        fileName: updates.name ?? file.name,
        path: nextPath,
        newVersion,
        previousVersion: file.version,
        fieldsUpdated,
        contentReplaced: false,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return fileId;
  },
});

export const remove = mutation({
  args: {
    fileId: v.id("projectFiles"),
  },
  returns: v.id("projectFiles"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const deletedBy = (await requireAuthedUser(ctx))._id;

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    // Role-only, no grant fallback — parity with accounts.remove.
    await authorizeFileAccess(ctx, {
      userId: deletedBy,
      projectId: file.projectId,
      action: "project:delete_file",
      preloadedProject: project,
    });

    // Idempotent: a retried delete must not clobber the original deletedAt
    // (which would restart the retention clock) or emit a second audit row.
    if (file.deletedAt !== undefined) {
      return args.fileId;
    }

    await ctx.db.patch(args.fileId, { deletedAt: now, updatedAt: now });

    const allPermissions = await ctx.db
      .query("filePermissions")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();
    const permissions = allPermissions.filter((perm) => perm.isActive);
    for (const perm of permissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
        revokedBy: deletedBy,
      });
    }

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId: deletedBy,
      action: "file.deleted",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        path: file.path,
        environments: file.environments,
        permissionsRevoked: permissions.length,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return args.fileId;
  },
});

/**
 * Restore a soft-deleted file inside the retention window.
 *
 * Re-checks path uniqueness: another file may have taken the path while this
 * one sat in the trash, and restoring blindly would break the invariant that
 * every (path, environment) pair resolves to at most one active file.
 */
export const restore = mutation({
  args: {
    fileId: v.id("projectFiles"),
  },
  returns: v.id("projectFiles"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const restoredBy = (await requireAuthedUser(ctx))._id;

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError(
        `File not found — it may have been permanently deleted after the ${PURGE_RETENTION_DAYS}-day retention period.`
      );
    }
    if (!file.deletedAt) {
      throw new ConvexError("File is not deleted");
    }
    // Past the window the file is purge-eligible: its blob and key may be
    // destroyed at any moment, so restoring would race the GC and could
    // resurrect a row whose contents no longer exist.
    if (file.deletedAt < now - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
      throw new ConvexError(
        `File can no longer be restored — the ${PURGE_RETENTION_DAYS}-day retention window has passed and it is scheduled for permanent deletion.`
      );
    }

    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await authorizeFileAccess(ctx, {
      userId: restoredBy,
      projectId: file.projectId,
      action: "project:delete_file",
      preloadedProject: project,
    });

    const clashes = await findFilePathConflicts(ctx, {
      projectId: file.projectId,
      path: file.path,
      environments: file.environments,
      excludeFileId: args.fileId,
    });
    if (clashes.length > 0) {
      throw new ConvexError(
        `Cannot restore "${file.name}": ${filePathConflictMessage(
          file.path,
          clashes
        )}`
      );
    }

    await ctx.db.patch(args.fileId, { deletedAt: undefined, updatedAt: now });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId: restoredBy,
      action: "file.restored",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        path: file.path,
        deletedAt: file.deletedAt,
        restoredAt: now,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return args.fileId;
  },
});

/**
 * Record a download. Called by values.getFileContent AFTER the plaintext is
 * produced, so the audit trail answers "who pulled the production signing
 * key, and when" — the question this feature exists to make answerable.
 */
export const logDownload = internalMutation({
  args: {
    fileId: v.id("projectFiles"),
    userId: v.id("users"),
    /** Untrusted client hint — see values.getFileContent. */
    clientHint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file) return null;
    const project = await ctx.db.get(file.projectId);
    if (!project) return null;

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId: args.userId,
      action: "file.downloaded",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        path: file.path,
        // Server-derived: this mutation is only reachable from the
        // getFileContent action, so the surface is known regardless of what
        // the caller claimed.
        source: "file-content-action",
        clientHint: args.clientHint,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });
    return null;
  },
});

// ==========================================
// PER-FILE PERMISSION GRANTS
// ==========================================

export const grantAccess = mutation({
  args: {
    fileId: v.id("projectFiles"),
    userId: v.id("users"),
    permission: v.union(v.literal("read"), v.literal("write")),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("filePermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const grantedBy = (await requireAuthedUser(ctx))._id;

    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await authorizeFileAccess(ctx, {
      userId: grantedBy,
      projectId: file.projectId,
      action: "project:manage_file_permissions",
      preloadedProject: project,
    });

    // A falsy expiry is treated as "no expiry" by every grant reader, so
    // expiresAt: 0 would grant permanent access instead of instant denial.
    // NaN and Infinity need the same refusal: `NaN <= now` is false, so a
    // non-finite expiry sailed past this check and then compared false in
    // every `expiresAt <= now` reader — a grant that never expires.
    if (
      args.expiresAt !== undefined &&
      (!Number.isFinite(args.expiresAt) || args.expiresAt <= now)
    ) {
      throw new ConvexError("Grant expiry must be a timestamp in the future");
    }

    const target = await ctx.db.get(args.userId);
    if (!target) {
      throw new ConvexError("User not found");
    }
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) {
      throw new ConvexError("User is not a member of this organization");
    }

    // Supersede any existing active grant rather than stacking rows, so
    // getActiveFileGrant never has to arbitrate between two live grants.
    const existing = await ctx.db
      .query("filePermissions")
      .withIndex("by_file_and_user", (q) =>
        q.eq("fileId", args.fileId).eq("userId", args.userId)
      )
      .collect();
    for (const grant of existing) {
      if (grant.isActive) {
        await ctx.db.patch(grant._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: grantedBy,
        });
      }
    }

    const permissionId = await ctx.db.insert("filePermissions", {
      fileId: args.fileId,
      userId: args.userId,
      permission: args.permission,
      grantedBy: grantedBy,
      grantedAt: now,
      expiresAt: args.expiresAt,
      isActive: true,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: file.projectId,
      userId: grantedBy,
      action: "file.permission_granted",
      details: {
        fileId: args.fileId,
        fileName: file.name,
        targetUserId: args.userId,
        permission: args.permission,
        expiresAt: args.expiresAt,
      },
      involvesSensitiveData: true,
      resourceType: "file",
    });

    return permissionId;
  },
});

export const revokeAccess = mutation({
  args: {
    fileId: v.id("projectFiles"),
    userId: v.id("users"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const revokedBy = (await requireAuthedUser(ctx))._id;

    const file = await ctx.db.get(args.fileId);
    if (!file) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await authorizeFileAccess(ctx, {
      userId: revokedBy,
      projectId: file.projectId,
      action: "project:manage_file_permissions",
      preloadedProject: project,
    });

    const grants = await ctx.db
      .query("filePermissions")
      .withIndex("by_file_and_user", (q) =>
        q.eq("fileId", args.fileId).eq("userId", args.userId)
      )
      .collect();

    let revoked = 0;
    for (const grant of grants) {
      if (!grant.isActive) continue;
      await ctx.db.patch(grant._id, {
        isActive: false,
        revokedAt: now,
        revokedBy: revokedBy,
      });
      revoked += 1;
    }

    if (revoked > 0) {
      await createAuditLog(ctx, {
        organizationId: project.organizationId,
        projectId: file.projectId,
        userId: revokedBy,
        action: "file.permission_revoked",
        details: {
          fileId: args.fileId,
          fileName: file.name,
          targetUserId: args.userId,
          grantsRevoked: revoked,
        },
        involvesSensitiveData: true,
        resourceType: "file",
      });
    }

    return revoked;
  },
});
