import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { requireFileAccess, authorizeFileAccess } from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import { requireAuthedUser } from "../../lib/identity";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countActiveFiles,
} from "../featureRegistry/gates";
import {
  isEnvironmentScopeAllowed,
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
} from "../../lib/authz";

/**
 * Secret File Queries
 *
 * METADATA ONLY. Nothing here reads a blob, touches WorkOS Vault, or
 * decrypts anything — that is `values.getFileContent`, one file at a time.
 *
 * The split is deliberate. `envpilot files status`, the extension's drift
 * badge, and the dashboard list all need name/path/size/sha and nothing
 * else; making them cheap means a status check costs one indexed read
 * instead of N decrypts. It also makes the 16 MiB function-return ceiling
 * unreachable: a project with fifty 5 MB files cannot produce a response
 * that fails to serialize, because the content never travels in a list.
 */

/** Bound on a single project listing, matching features/api/reads.ts. */
const MAX_FILE_ROWS = 1000;

/**
 * Build a fileId → active grant lookup from a caller's grant rows.
 * Mirror of buildActiveAccountGrantMap: active + unexpired, first wins.
 */
function buildActiveFileGrantMap(
  grants: Doc<"filePermissions">[]
): Map<string, Doc<"filePermissions">> {
  const now = Date.now();
  const byFile = new Map<string, Doc<"filePermissions">>();
  for (const grant of grants) {
    if (!grant.isActive) continue;
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.fileId as string;
    if (!byFile.has(key)) byFile.set(key, grant);
  }
  return byFile;
}

const fileMetadataValidator = v.object({
  _id: v.id("projectFiles"),
  name: v.string(),
  path: v.string(),
  mode: v.string(),
  contentType: v.optional(v.string()),
  size: v.number(),
  sha256: v.string(),
  digestSalt: v.string(),
  description: v.optional(v.string()),
  environments: v.array(v.string()),
  projectId: v.id("projects"),
  version: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  access: v.union(v.literal("read"), v.literal("write")),
});

/**
 * List a project's active secret files with the caller's effective access.
 *
 * Files the caller cannot see are omitted entirely (not returned with a null
 * access), matching how accounts and variables behave: an out-of-scope
 * resource is invisible, not visibly-denied.
 */
export const list = query({
  args: {
    projectId: v.id("projects"),
    environment: v.optional(v.string()),
  },
  returns: v.array(fileMetadataValidator),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const membership = await getActiveMembership(
      ctx,
      project.organizationId,
      user._id
    );
    if (!membership) {
      throw new ConvexError("Not authorized");
    }
    const profile = await getRoleProfile(ctx, membership.role);

    const assignment = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", user._id)
      )
      .first();

    // Unassigned members without assignment bypass can still hold per-file
    // grants (the "viewer sharing" path), so we do not bail out here.
    const assignmentBypassed = bypassesAssignment(profile);
    const envScope =
      hasCapability(profile, "access.env_scoped") && assignment
        ? assignment.environments
        : undefined;

    const rows = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(MAX_FILE_ROWS + 1);

    if (rows.length > MAX_FILE_ROWS) {
      throw new ConvexError(
        `Project has more than ${MAX_FILE_ROWS} secret files — refusing a partial listing. Contact support to raise the limit.`
      );
    }

    const grantRows = await ctx.db
      .query("filePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", user._id).eq("isActive", true)
      )
      .collect();
    const grantsByFile = buildActiveFileGrantMap(grantRows);

    const blanketWrite =
      (assignmentBypassed || assignment !== null) &&
      hasCapability(profile, "project.files.update");
    const blanketRead =
      (assignmentBypassed || assignment !== null) &&
      hasCapability(profile, "access.blanket_read");

    const results: Array<Doc<"projectFiles"> & { access: "read" | "write" }> =
      [];
    for (const file of rows) {
      if (file.deletedAt !== undefined) continue;
      if (
        args.environment !== undefined &&
        !file.environments.includes(args.environment)
      ) {
        continue;
      }
      // Environment scope wins over any grant — an out-of-scope file is
      // invisible to a scoped developer even when explicitly shared.
      if (!isEnvironmentScopeAllowed(envScope, file.environments)) continue;

      // SAME precedence as resolveResourceAccess: blanket write, then
      // blanket read, then the grant. Consulting the grant before blanket
      // read gave a role holding BOTH access.blanket_read and
      // access.grant_fallback a "write" here that the server resolves back
      // down to read — replace/edit controls the mutation then refuses.
      let access: "read" | "write" | null = null;
      if (blanketWrite) {
        access = "write";
      } else if (blanketRead) {
        access = "read";
      } else {
        const grant = grantsByFile.get(file._id as string);
        if (grant) {
          // An unassigned member (the viewer-sharing path), or one whose
          // role lacks grant fallback, resolves to read even holding a write
          // grant.
          const grantFallback =
            assignmentBypassed ||
            (assignment !== null &&
              hasCapability(profile, "access.grant_fallback"));
          access =
            grantFallback && grant.permission === "write" ? "write" : "read";
        }
      }
      if (!access) continue;

      results.push({ ...file, access });
    }

    return results.map((file) => ({
      _id: file._id,
      name: file.name,
      path: file.path,
      mode: file.mode ?? "0600",
      contentType: file.contentType,
      size: file.size,
      sha256: file.sha256,
      digestSalt: file.digestSalt,
      description: file.description,
      environments: file.environments,
      projectId: file.projectId,
      version: file.version,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      access: file.access,
    }));
  },
});

/** Single-file metadata with an authorization check at a minimum level. */
export const get = query({
  args: {
    fileId: v.id("projectFiles"),
    minimumAccess: v.optional(v.union(v.literal("read"), v.literal("write"))),
  },
  returns: fileMetadataValidator,
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const access = await requireFileAccess(
      ctx,
      user._id,
      file,
      args.minimumAccess ?? "read",
      project
    );

    return {
      _id: file._id,
      name: file.name,
      path: file.path,
      mode: file.mode ?? "0600",
      contentType: file.contentType,
      size: file.size,
      sha256: file.sha256,
      digestSalt: file.digestSalt,
      description: file.description,
      environments: file.environments,
      projectId: file.projectId,
      version: file.version,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      access,
    };
  },
});

/**
 * Remaining upload quota for the caller's organization.
 *
 * The cap is ORG-wide, but a project page only knows its own files — gating
 * the Upload button on that local count leaves it enabled right up to a
 * server rejection whenever the org's other projects hold the slots. This
 * runs the same checkCountedLimit the mutation runs, so the button and the
 * server agree.
 */
export const uploadQuota = query({
  args: { projectId: v.id("projects") },
  returns: v.object({
    allowed: v.boolean(),
    current: v.number(),
    limit: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return { allowed: false, current: 0, limit: null };
    }
    const membership = await getActiveMembership(
      ctx,
      project.organizationId,
      user._id
    );
    if (!membership) return { allowed: false, current: 0, limit: null };

    // Same three checks the upload preflight runs, in the same order — the
    // point of this query is that the button's disabled state matches the
    // server. Reporting only the count limit left Upload enabled for members
    // without create permission and for tiers with the feature switched off,
    // so the click failed after they had already picked a file.
    try {
      await authorizeFileAccess(ctx, {
        userId: user._id,
        projectId: args.projectId,
        action: "project:create_file",
        preloadedProject: project,
      });
    } catch {
      return { allowed: false, current: 0, limit: null };
    }

    const boolGate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secret_files"
    );
    if (!boolGate.allowed) {
      return { allowed: false, current: 0, limit: null };
    }

    const gate = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "secret_files_limit",
      (limit) => countActiveFiles(ctx.db, project.organizationId, limit)
    );
    return {
      allowed: gate.allowed,
      current: gate.current ?? 0,
      limit: gate.limit ?? null,
    };
  },
});

/** Trash listing — soft-deleted files still inside the retention window. */
export const getDeleted = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      _id: v.id("projectFiles"),
      name: v.string(),
      path: v.string(),
      size: v.number(),
      environments: v.array(v.string()),
      deletedAt: v.number(),
      expiresAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Only roles that can delete/restore see trashed files — but RETURN empty
    // rather than throw. The trash page renders variables, accounts, and files
    // together and gates its loading state on all three queries resolving; a
    // throwing query here leaves the whole page stuck on its spinner for
    // anyone without this capability, instead of just hiding one section.
    // Mirrors accounts.getDeleted exactly.
    try {
      await authorizeFileAccess(ctx, {
        userId: user._id,
        projectId: args.projectId,
        action: "project:delete_file",
        preloadedProject: project,
      });
    } catch {
      return [];
    }

    const retentionMs = PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - retentionMs;

    const rows = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gt("deletedAt", cutoff)
      )
      .collect();

    return rows
      .filter(
        (f): f is Doc<"projectFiles"> & { deletedAt: number } =>
          f.deletedAt !== undefined
      )
      .map((f) => ({
        _id: f._id,
        name: f.name,
        path: f.path,
        size: f.size,
        environments: f.environments,
        deletedAt: f.deletedAt,
        expiresAt: f.deletedAt + retentionMs,
      }));
  },
});

/** Active grants on a file, for the permission drawer. */
export const listPermissions = query({
  args: { fileId: v.id("projectFiles") },
  returns: v.array(
    v.object({
      _id: v.id("filePermissions"),
      userId: v.id("users"),
      userName: v.optional(v.string()),
      userEmail: v.string(),
      permission: v.union(v.literal("read"), v.literal("write")),
      grantedAt: v.number(),
      expiresAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const user = await requireAuthedUser(ctx);

    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await authorizeFileAccess(ctx, {
      userId: user._id,
      projectId: file.projectId,
      action: "project:manage_file_permissions",
      preloadedProject: project,
    });

    const now = Date.now();
    const grants = await ctx.db
      .query("filePermissions")
      .withIndex("by_file", (q) => q.eq("fileId", args.fileId))
      .collect();

    const results = [];
    for (const grant of grants) {
      if (!grant.isActive) continue;
      if (grant.expiresAt && grant.expiresAt <= now) continue;
      const target = await ctx.db.get(grant.userId);
      if (!target) continue;
      results.push({
        _id: grant._id,
        userId: grant.userId,
        userName: target.name,
        userEmail: target.email,
        permission: grant.permission,
        grantedAt: grant.grantedAt,
        expiresAt: grant.expiresAt,
      });
    }
    return results;
  },
});

/**
 * Internal: resolve a file plus its project org for the content action.
 * Separate from `get` because actions cannot read the database directly and
 * the action needs the storage/vault refs that `get` deliberately omits.
 */
export const _getForContent = internalQuery({
  args: {
    fileId: v.id("projectFiles"),
    userId: v.id("users"),
  },
  returns: v.object({
    vaultRef: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    path: v.string(),
    mode: v.string(),
    size: v.number(),
    sha256: v.string(),
    contentType: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.fileId);
    if (!file || file.deletedAt) {
      throw new ConvexError("File not found");
    }
    const project = await ctx.db.get(file.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    // Read access is enough to download — write is for replacing.
    await requireFileAccess(ctx, args.userId, file, "read", project);

    return {
      vaultRef: file.vaultRef,
      storageId: file.storageId,
      name: file.name,
      path: file.path,
      mode: file.mode ?? "0600",
      size: file.size,
      sha256: file.sha256,
      contentType: file.contentType,
    };
  },
});
