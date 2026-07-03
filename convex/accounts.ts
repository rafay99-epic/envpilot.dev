import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  checkBooleanFeature,
  checkNumericLimit,
  countActiveAccounts,
} from "./featureRegistry";
import { createAuditLog } from "./auditHelpers";
import { authorizeAccountAccess, requireAccountAccess } from "./authHelpers";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
} from "./authz";

/**
 * Shared Account Queries and Mutations
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

/**
 * Build an accountId → active grant lookup from a caller's grant rows.
 *
 * Mirror of variables.buildActiveGrantMap: only rows that are active and
 * unexpired qualify, and the first such row per account wins. Callers pass
 * rows already filtered to isActive=true (via the by_user_active index).
 */
function buildActiveAccountGrantMap(
  grants: Doc<"accountPermissions">[]
): Map<string, Doc<"accountPermissions">> {
  const now = Date.now();
  const byAccount = new Map<string, Doc<"accountPermissions">>();
  for (const grant of grants) {
    if (!grant.isActive) continue;
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.accountId as string;
    if (!byAccount.has(key)) byAccount.set(key, grant);
  }
  return byAccount;
}

// ==========================================
// QUERIES
// ==========================================

/**
 * List accounts with unified-role and per-account access information.
 *
 * Access rules (unified model — see convex/authz.ts):
 * - Owners: write access to every account
 * - Project managers / team leads assigned to the project: write access
 * - Developers assigned to the project: value access via per-account grants;
 *   they still see metadata (no vault refs) for ungranted accounts
 * - Unassigned org members: read-only on accounts explicitly shared with them
 *   via an active grant (per-account viewer sharing)
 *
 * vaultRef is spread onto a row ONLY when hasAccess is true.
 */
export const listWithAccess = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Get user's org membership to determine their unified role
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return [];
    }

    const orgRole = normalizeOrgRole(membership.role);
    const isOwner = orgRole === "owner";

    // Assignment is a pure scope check — projectMembers.role is legacy
    // and never consulted for authorization.
    let assigned = false;
    let environmentScope: string[] | undefined;
    if (!isOwner) {
      const projectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.userId)
        )
        .first();
      assigned = !!projectMembership;
      // Environment scope only constrains assigned developers
      if (orgRole === "developer") {
        environmentScope = projectMembership?.environments;
      }
    }

    // Owners and assigned PMs/team leads have blanket write access
    const roleAccess =
      isOwner ||
      (assigned && (orgRole === "project_manager" || orgRole === "team_lead"));
    const canManagePermissions = roleAccess;
    const projectRole = toLegacyProjectRole(orgRole, assigned);

    const allAccounts = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .take(args.limit ?? 500);
    // Scoped developers never receive out-of-scope accounts at all —
    // not even their metadata
    const accounts = allAccounts.filter(
      (account) =>
        account.deletedAt === undefined &&
        isEnvironmentScopeAllowed(environmentScope, account.environments)
    );

    // Prefetch the caller's active grants ONCE instead of one indexed query
    // per account (getActiveAccountGrant N+1).
    const grantByAccount = buildActiveAccountGrantMap(
      await ctx.db
        .query("accountPermissions")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", args.userId).eq("isActive", true)
        )
        .collect()
    );

    const accountsWithAccess = accounts.map((account) => {
      const grant = grantByAccount.get(account._id as string) ?? null;

      // Mirrors getAccountAccess: owner → write; assigned PM/TL → write;
      // developers per grant; unassigned grant holders capped at read.
      let access: "write" | "read" | null = null;
      if (roleAccess) {
        access = "write";
      } else if (grant) {
        access = !assigned || grant.permission === "read" ? "read" : "write";
      }

      const hasAccess = access !== null;
      const effectivePermission = roleAccess ? "admin" : access;

      // Vault refs are only returned for accounts the user can access;
      // assigned members still see metadata for the rest.
      const { vaultRef, ...metadata } = account;

      return {
        ...metadata,
        ...(hasAccess ? { vaultRef } : {}),
        hasAccess,
        permission: effectivePermission,
        roleAccess,
        userRole: orgRole,
        projectRole,
        canManagePermissions,
      };
    });

    // Assigned members (and owners) may list metadata for every account;
    // grant-only viewers see just the accounts shared with them.
    if (!isOwner && !assigned) {
      return accountsWithAccess.filter((a) => a.hasAccess);
    }

    return accountsWithAccess;
  },
});

/**
 * Fetch a single account for a caller with at least read access.
 * Throws if the account is missing/deleted or the caller has no access.
 * The returned row includes vaultRef so the reveal API route can read Vault.
 */
export const get = query({
  args: {
    accountId: v.id("projectAccounts"),
    userId: v.id("users"),
    // Minimum access the caller must hold. Defaults to "read". Callers that
    // are about to mutate the underlying Vault secret (credential rotation)
    // pass "write" so the request is rejected BEFORE any Vault write happens.
    minimumAccess: v.optional(v.union(v.literal("read"), v.literal("write"))),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (!account || account.deletedAt) {
      throw new Error("Account not found");
    }

    // Authorization: owner / assigned PM/TL / developer or viewer with a grant
    await requireAccountAccess(
      ctx,
      args.userId,
      account,
      args.minimumAccess ?? "read"
    );

    return account;
  },
});

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
    const { orgRole, environmentScope } = await authorizeAccountAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_account",
    });

    // Environment scope: scoped developers may only create accounts whose
    // environments all fall inside their assignment scope
    assertWithinEnvironmentScope(environmentScope, args.environments);

    // An account must belong to at least one environment
    if (args.environments.length === 0) {
      throw new Error("An account must have at least one environment");
    }

    // Feature gate: shared_accounts boolean
    const boolGate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "shared_accounts"
    );
    if (!boolGate.allowed) {
      throw new Error(
        boolGate.reason ?? "Shared accounts are not enabled for your tier."
      );
    }

    // Feature gate: shared_accounts_limit numeric
    const accountCount = await countActiveAccounts(
      ctx.db,
      project.organizationId
    );
    const numGate = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "shared_accounts_limit",
      accountCount
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

    // Developers have no blanket write access — an automatic grant keeps
    // write access to the accounts they create (parity with variables.create).
    if (orgRole === "developer") {
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
    await requireAccountAccess(ctx, userId, account, "write");

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
    });

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
      severity: "warning",
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
