import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countActiveAccounts,
} from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";
import { createAuditLog } from "../../lib/audit";
import {
  authorizeAccountAccess,
  requireAccountAccess,
} from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import { isEnvironmentScopeAllowed, normalizeOrgRole } from "../../lib/authz";
import { revokeSharesForResource } from "../sharing/helpers";

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
  if (!isEnvironmentScopeAllowed(scope, environments)) {
    throw new Error(
      `Your access is limited to these environments: ${(scope ?? []).join(", ")}`
    );
  }
}

// ==========================================
// MUTATIONS
// ==========================================

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    createdBy: v.id("users"),
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    vaultRef: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead / developer
    const { environmentScope } = await authorizeAccountAccess(ctx, {
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

    // LOCKDOWN NOTE: developers can no longer reach this mutation
    // (project:create_account excludes them — account requests are the
    // path), so the old auto-write-grant-on-create is gone. Grants cap at
    // read in getAccountAccess regardless.

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

    return accountId;
  },
});

export const update = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    userId: v.id("users"),
    name: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    // Whether the API route re-wrote the vault secret in place (updateSecret
    // overwrites the same vaultRef). Convex never sees the credentials — this
    // is only used to bump the version and annotate the audit trail.
    credentialsChanged: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { accountId, userId, credentialsChanged, ...updates } = args;

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

      if (
        editorMembership &&
        normalizeOrgRole(editorMembership.role) === "developer"
      ) {
        const editorAssignment = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", account.projectId).eq("userId", userId)
          )
          .first();

        assertWithinEnvironmentScope(
          editorAssignment?.environments,
          updates.environments
        );
      }
    }

    const newVersion = account.version + 1;

    const updateData: Record<string, unknown> = {
      updatedAt: now,
      lastModifiedBy: userId,
      version: newVersion,
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    // An empty string clears the optional field. Convex patch treats an
    // explicit `undefined` as field removal, so map "" → undefined.
    if (updates.websiteUrl !== undefined)
      updateData.websiteUrl =
        updates.websiteUrl === "" ? undefined : updates.websiteUrl;
    if (updates.description !== undefined)
      updateData.description =
        updates.description === "" ? undefined : updates.description;
    if (updates.environments !== undefined)
      updateData.environments = updates.environments;

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

    return accountId;
  },
});

export const remove = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
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

    return args.accountId;
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
export const restore = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    restoredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
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

    return args.accountId;
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
