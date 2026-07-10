import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import {
  requireAccountAccess,
  authorizeAccountAccess,
} from "../../authHelpers";
import { PURGE_RETENTION_DAYS } from "../../vaultGc";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
} from "../../authz";

/**
 * Shared Account Queries
 *
 * A project account is a service-login credential (username/email + password +
 * website) whose secret payload lives encrypted in WorkOS Vault. Convex stores
 * only the vault reference plus non-secret metadata. RBAC, environment scoping,
 * and per-account viewer sharing mirror environmentVariables exactly — see
 * authz.getAccountAccess / authHelpers.requireAccountAccess.
 */

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

/**
 * List a project's soft-deleted accounts that are still within the
 * PURGE_RETENTION_DAYS restore window — twin of variables.getDeleted.
 * vaultGc purges anything older, so those are excluded here rather than
 * surfaced as "restorable".
 *
 * Authorization mirrors restore: only owners / assigned PM / team lead
 * ("project:delete_account") may see the trash list. Like the other
 * list-style queries in this file (listWithAccess) this returns [] rather
 * than throwing when the project is gone or the caller lacks access, so the
 * UI can render nothing instead of erroring.
 */
export const getDeleted = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    try {
      await authorizeAccountAccess(ctx, {
        userId: args.userId,
        projectId: args.projectId,
        action: "project:delete_account",
        preloadedProject: project,
      });
    } catch {
      return [];
    }

    const cutoff = Date.now() - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // by_project_deleted reads exactly this project's soft-deleted rows in
    // the restore window — see variables.getDeleted for the ordering note.
    // desc: newest deletions first so the 100-row cap drops the oldest.
    const deletedAccounts = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gte("deletedAt", cutoff)
      )
      .order("desc")
      .take(100);

    return deletedAccounts.map((account) => ({
      _id: account._id,
      name: account.name,
      deletedAt: account.deletedAt as number,
    }));
  },
});
