import { v, ConvexError } from "convex/values";
import { validateHttpUrl, urlValidationMessage } from "../../lib/urlValidation";
import { mutation, type MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countActiveAccounts,
} from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";
import { createAuditLog } from "../../lib/audit";
import { requireAuthedUser } from "../../lib/identity";
import {
  authorizeAccountAccess,
  requireAccountAccess,
} from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  getRoleProfile,
  hasCapability,
  effectiveEnvironments,
  environmentAccessMessage,
} from "../../lib/authz";
import { revokeSharesForResource } from "../sharing/helpers";
import {
  assertProtectedWrite,
  isProtectedWrite,
  touchedEnvironments,
} from "../../lib/protection";
import { cancelPendingForTarget } from "../changeRequests/mutations";

/**
 * Shared Account Mutations
 *
 * A project account is a service-login credential (username/email + password +
 * website) whose secret payload lives encrypted in WorkOS Vault. Convex stores
 * only the vault reference plus non-secret metadata. RBAC, environment scoping,
 * and per-account viewer sharing mirror environmentVariables exactly — see
 * authz.getAccountAccess / authHelpers.requireAccountAccess.
 */

/**
 * Throw when a scoped developer touches environments outside their assignment
 * scope. No-op for unrestricted (undefined) scopes — see authz.ts.
 */
function assertWithinEnvironmentScope(
  scope: string[] | undefined,
  environments: string[]
): void {
  if (isEnvironmentScopeAllowed(scope, environments)) return;
  const blocked = environments.find((env) => !(scope ?? []).includes(env))!;
  throw new ConvexError(environmentAccessMessage(blocked));
}

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Reject a `websiteUrl` that is not a well-formed http(s) URL. The rule lives
 * in lib/urlValidation so it is unit-testable without the Convex runtime.
 */
function assertValidWebsiteUrl(websiteUrl: string | undefined): void {
  const error = validateHttpUrl(websiteUrl);
  if (error) throw new ConvexError(urlValidationMessage(error));
}

export async function createCore(
  ctx: MutationCtx,
  args: {
    projectId: Id<"projects">;
    createdBy: Id<"users">;
    name: string;
    websiteUrl?: string;
    description?: string;
    environments: string[];
    vaultRef: string;
    // Set ONLY by changeRequests/apply.ts. Never a client-supplied argument:
    // it is what lets a write into a protected environment through.
    viaRequestId?: Id<"changeRequests">;
    override?: boolean;
  }
) {
  const now = Date.now();

  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  // Authorization: capability project.accounts.create (assignment-gated)
  const { environmentScope, profile: creatorProfile } =
    await authorizeAccountAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_account",
      preloadedProject: project,
    });

  // Environment scope: scoped developers may only create accounts whose
  // environments all fall inside their assignment scope
  assertWithinEnvironmentScope(environmentScope, args.environments);

  // An account must belong to at least one environment
  if (args.environments.length === 0) {
    throw new Error("An account must have at least one environment");
  }

  // Protected environments: refuse a direct write, unless this is the apply
  // path or an audited break-glass override.
  await assertProtectedWrite(ctx, {
    project,
    envs: args.environments,
    actorId: args.createdBy,
    viaRequestId: args.viaRequestId,
    override: args.override,
  });

  // Resolve the shared org/tier/grace context once and reuse it for both
  // gate checks against this org (avoids re-fetching the same rows twice).
  const gate = await resolveOrgGateContext(ctx.db, project.organizationId);

  // Feature gate: shared_accounts boolean
  const boolGate = await checkBooleanFeature(
    ctx.db,
    project.organizationId,
    "shared_accounts",
    gate
  );
  if (!boolGate.allowed) {
    throw new Error(
      boolGate.reason ?? "Shared accounts are not enabled for your tier."
    );
  }

  // Feature gate: shared_accounts_limit numeric. Limit-first: only fans out
  // across the org's projects to count accounts when the tier's limit is
  // finite, bounded at that limit rather than reading every account.
  const numGate = await checkCountedLimit(
    ctx.db,
    project.organizationId,
    "shared_accounts_limit",
    (limit) => countActiveAccounts(ctx.db, project.organizationId, limit),
    gate
  );
  if (!numGate.allowed) {
    throw new Error(
      numGate.reason ??
        `Shared account limit reached (${numGate.current}/${numGate.limit}). Upgrade your tier for more.`
    );
  }

  assertValidWebsiteUrl(args.websiteUrl);

  const accountId = await ctx.db.insert("projectAccounts", {
    name: args.name,
    websiteUrl: args.websiteUrl,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    projectId: args.projectId,
    createdBy: args.createdBy,
    lastModifiedBy: args.createdBy,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Creators WITHOUT blanket write get an automatic write grant — main
  // parity, generalized (see variables.createCore).
  if (!hasCapability(creatorProfile, "project.accounts.update")) {
    await ctx.db.insert("accountPermissions", {
      accountId,
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
    action: "account.created",
    details: {
      accountId,
      accountName: args.name,
      environments: args.environments,
    },
    involvesSensitiveData: true,
    resourceType: "account",
  });

  if (args.override && isProtectedWrite(project, args.environments)) {
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.createdBy,
      action: "change.overridden",
      details: {
        accountId,
        accountName: args.name,
        environments: args.environments,
        kind: "create",
      },
    });
  }

  return accountId;
}

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    // Ignored: kept so existing clients keep type-checking. See the handler.
    createdBy: v.id("users"),
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    vaultRef: v.string(),
    override: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Actor comes from the verified JWT, NEVER from an argument: these
    // mutations are callable directly by the browser, so a client-supplied
    // user id would let any member act as anyone else (and resolve the
    // break-glass override against someone else's role).
    const createdBy = (await requireAuthedUser(ctx))._id;
    return createCore(ctx, { ...args, createdBy });
  },
});

export async function updateCore(
  ctx: MutationCtx,
  args: {
    accountId: Id<"projectAccounts">;
    userId: Id<"users">;
    name?: string;
    websiteUrl?: string;
    description?: string;
    environments?: string[];
    // Whether the credentials were re-written (in place for a direct edit, or
    // into `vaultRef` for an approved proposal). Convex never sees the
    // credentials — this only bumps the version and annotates the audit trail.
    credentialsChanged: boolean;
    // A freshly minted vault object the account should point at instead of
    // its current one. Only the apply path stages credentials this way.
    vaultRef?: string;
    viaRequestId?: Id<"changeRequests">;
    override?: boolean;
  }
) {
  const now = Date.now();
  const {
    accountId,
    userId,
    credentialsChanged,
    vaultRef,
    viaRequestId,
    override,
    ...updates
  } = args;

  const account = await ctx.db.get(accountId);
  if (!account || account.deletedAt) {
    throw new Error("Account not found");
  }

  const project = await ctx.db.get(account.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Authorization: effective write access — owner, assigned PM/team lead,
  // or a developer holding a write grant on this account
  await requireAccountAccess(ctx, userId, account, "write", project);

  // Environment scope: getAccountAccess already blocks scoped developers
  // from touching out-of-scope accounts, but the NEW environments must also
  // stay inside the scope — a scoped developer must not move an account into
  // an out-of-scope environment (mirror variables.update's second check).
  if (updates.environments !== undefined) {
    if (updates.environments.length === 0) {
      throw new Error("An account must have at least one environment");
    }

    const editorMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", userId)
      )
      .first();

    const updaterProfile = editorMembership
      ? await getRoleProfile(ctx, editorMembership.role)
      : null;
    if (updaterProfile) {
      const editorAssignment = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", account.projectId).eq("userId", userId)
        )
        .first();

      assertWithinEnvironmentScope(
        effectiveEnvironments(updaterProfile, editorAssignment?.environments),
        updates.environments
      );
    }
  }

  const touched = touchedEnvironments(
    account.environments,
    updates.environments
  );
  await assertProtectedWrite(ctx, {
    project,
    envs: touched,
    actorId: userId,
    viaRequestId,
    override,
  });

  const newVersion = account.version + 1;

  const updateData: Record<string, unknown> = {
    updatedAt: now,
    lastModifiedBy: userId,
    version: newVersion,
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  // An empty string clears the optional field. Convex patch treats an
  // explicit `undefined` as field removal, so map "" → undefined.
  if (updates.websiteUrl !== undefined) {
    assertValidWebsiteUrl(updates.websiteUrl);
    updateData.websiteUrl =
      updates.websiteUrl === "" ? undefined : updates.websiteUrl;
  }
  if (updates.description !== undefined)
    updateData.description =
      updates.description === "" ? undefined : updates.description;
  if (updates.environments !== undefined)
    updateData.environments = updates.environments;
  // An approved proposal carries its credentials in a NEW vault object (a
  // pending request must never rewrite the live one). Swapping the pointer
  // strands the old object, so it is destroyed once nothing references it.
  if (vaultRef !== undefined && vaultRef !== account.vaultRef) {
    updateData.vaultRef = vaultRef;
    await ctx.scheduler.runAfter(
      0,
      internal.features.vault.vault.deleteSecret,
      { vaultRef: account.vaultRef }
    );
  }

  await ctx.db.patch(accountId, updateData);

  // Fields the user actually changed — NEVER the credential values themselves
  const fieldsUpdated = Object.keys(updates).filter(
    (k) => updates[k as keyof typeof updates] !== undefined
  );
  if (credentialsChanged) fieldsUpdated.push("credentials");

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: account.projectId,
    userId,
    action: "account.updated",
    details: {
      accountId,
      accountName: updates.name ?? account.name,
      newVersion,
      previousVersion: account.version,
      fieldsUpdated,
      credentialsChanged,
    },
    involvesSensitiveData: true,
    resourceType: "account",
  });

  if (override && isProtectedWrite(project, touched)) {
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: account.projectId,
      userId,
      action: "change.overridden",
      details: {
        accountId,
        accountName: account.name,
        environments: touched,
        kind: "update",
      },
    });
  }

  return accountId;
}

export const update = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    // Ignored: kept so existing clients keep type-checking. See the handler.
    userId: v.id("users"),
    name: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    credentialsChanged: v.boolean(),
    override: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = (await requireAuthedUser(ctx))._id;
    return updateCore(ctx, { ...args, userId });
  },
});

export async function removeCore(
  ctx: MutationCtx,
  args: {
    accountId: Id<"projectAccounts">;
    deletedBy: Id<"users">;
    viaRequestId?: Id<"changeRequests">;
    override?: boolean;
  }
) {
  const now = Date.now();

  const account = await ctx.db.get(args.accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  const project = await ctx.db.get(account.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Authorization: owner, or assigned PM / team lead (role-only, no grant
  // fallback — parity with variables.remove; developers can never delete).
  await authorizeAccountAccess(ctx, {
    userId: args.deletedBy,
    projectId: account.projectId,
    action: "project:delete_account",
    preloadedProject: project,
  });

  await assertProtectedWrite(ctx, {
    project,
    envs: account.environments,
    actorId: args.deletedBy,
    viaRequestId: args.viaRequestId,
    override: args.override,
  });

  // Idempotent no-op: an account that's already soft-deleted must not be
  // re-patched (which would clobber the original deletedAt) or emit a
  // second "account.deleted" audit row on a retried/duplicate call.
  if (account.deletedAt !== undefined) {
    return args.accountId;
  }

  await ctx.db.patch(args.accountId, {
    deletedAt: now,
    updatedAt: now,
  });

  // Revoke active per-account grants (parity with variables.remove)
  const allPermissions = await ctx.db
    .query("accountPermissions")
    .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
    .collect();
  const permissions = allPermissions.filter((perm) => perm.isActive);

  for (const perm of permissions) {
    await ctx.db.patch(perm._id, {
      isActive: false,
      revokedAt: now,
      revokedBy: args.deletedBy,
    });
  }

  // Revoke any active share links pointing at this account (parity with
  // variables.remove — a deleted account must not leave a live share link).
  await revokeSharesForResource(ctx, {
    resourceType: "account",
    accountId: args.accountId,
    actorId: args.deletedBy,
  });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: account.projectId,
    userId: args.deletedBy,
    action: "account.deleted",
    details: {
      accountId: args.accountId,
      accountName: account.name,
      environments: account.environments,
      permissionsRevoked: permissions.length,
    },
    involvesSensitiveData: true,
    resourceType: "account",
  });

  if (args.override && isProtectedWrite(project, account.environments)) {
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: account.projectId,
      userId: args.deletedBy,
      action: "change.overridden",
      details: {
        accountId: args.accountId,
        accountName: account.name,
        environments: account.environments,
        kind: "delete",
      },
    });
  }

  // Proposals aimed at a resource that no longer exists can never be applied.
  await cancelPendingForTarget(
    ctx,
    args.accountId,
    args.deletedBy,
    "target deleted",
    args.viaRequestId
  );

  return args.accountId;
}

export const remove = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    // Ignored: kept so existing clients keep type-checking. See the handler.
    deletedBy: v.id("users"),
    override: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const deletedBy = (await requireAuthedUser(ctx))._id;
    return removeCore(ctx, { ...args, deletedBy });
  },
});

/**
 * Restore a soft-deleted account within the 7-day retention window.
 *
 * Mirror of variables.restore (convex/variables.ts): same authorization
 * (owner / assigned PM / team lead via "project:delete_account"), clears
 * deletedAt, and writes an audit entry. Like variables.restore it does NOT
 * reactivate per-account permission grants — those were deactivated on delete
 * and are re-granted explicitly if needed (exact behavior parity).
 *
 * Once the daily vault-GC sweep (convex/vaultGc.ts) purges the account after
 * the retention window, its row is gone and restore fails with a not-found
 * error that names the expired window (see the null-account branch below).
 *
 * NOTE: the auditLogs action union has no "account.restored" literal and this
 * change is constrained to index-only schema edits, so the restore is recorded
 * as "account.updated" with a `restored: true` detail. See vault-gc.md for the
 * follow-up recommendation to add a dedicated audit action.
 */
export async function restoreCore(
  ctx: MutationCtx,
  args: {
    accountId: Id<"projectAccounts">;
    restoredBy: Id<"users">;
    viaRequestId?: Id<"changeRequests">;
    override?: boolean;
  }
) {
  const now = Date.now();

  const account = await ctx.db.get(args.accountId);
  if (!account) {
    throw new Error(
      "Account not found — it may have been permanently deleted after the 7-day retention period."
    );
  }

  if (!account.deletedAt) {
    throw new Error("Account is not deleted");
  }

  // Past the retention window the account is purge-eligible: its vault
  // object may be destroyed at any moment, so restoring would race the
  // GC and could resurrect an account whose credentials no longer exist.
  if (account.deletedAt < now - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
    throw new Error(
      `Account can no longer be restored — the ${PURGE_RETENTION_DAYS}-day retention window has passed and it is scheduled for permanent deletion.`
    );
  }

  const project = await ctx.db.get(account.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Authorization: owner, or assigned PM / team lead (parity with
  // accounts.remove — role-only, developers can never restore).
  await authorizeAccountAccess(ctx, {
    userId: args.restoredBy,
    projectId: account.projectId,
    action: "project:delete_account",
    preloadedProject: project,
  });

  await assertProtectedWrite(ctx, {
    project,
    envs: account.environments,
    actorId: args.restoredBy,
    viaRequestId: args.viaRequestId,
    override: args.override,
  });

  await ctx.db.patch(args.accountId, {
    deletedAt: undefined,
    updatedAt: now,
  });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: account.projectId,
    userId: args.restoredBy,
    action: "account.updated",
    details: {
      accountId: args.accountId,
      accountName: account.name,
      restored: true,
      deletedAt: account.deletedAt,
      restoredAt: now,
    },
    involvesSensitiveData: true,
    resourceType: "account",
  });

  if (args.override && isProtectedWrite(project, account.environments)) {
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: account.projectId,
      userId: args.restoredBy,
      action: "change.overridden",
      details: {
        accountId: args.accountId,
        accountName: account.name,
        environments: account.environments,
        kind: "restore",
      },
    });
  }

  return args.accountId;
}

export const restore = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    // Ignored: kept so existing clients keep type-checking. See the handler.
    restoredBy: v.id("users"),
    override: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const restoredBy = (await requireAuthedUser(ctx))._id;
    return restoreCore(ctx, { ...args, restoredBy });
  },
});

/**
 * Audit a credential reveal. Called by the reveal API route after the vault
 * value is fetched. Authorization requires at least read access; the audit
 * details never contain the credential values (only the account name).
 */
export const logAccess = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    accessedBy: v.id("users"),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    const project = await ctx.db.get(account.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: anyone with effective access to this account
    // (role-based write, or an active read/write grant)
    await requireAccountAccess(ctx, args.accessedBy, account, "read");

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: account.projectId,
      userId: args.accessedBy,
      action: "account.accessed",
      details: {
        accountId: args.accountId,
        accountName: account.name,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      sessionId: args.sessionId,
      involvesSensitiveData: true,
      resourceType: "account",
    });

    return true;
  },
});
