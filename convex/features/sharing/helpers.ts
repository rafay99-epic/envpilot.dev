import type {
  DatabaseReader,
  QueryCtx,
  MutationCtx,
} from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { Id } from "../../_generated/dataModel";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  hasCapability,
  effectiveEnvironments,
  type RoleProfile,
} from "../../lib/authz";
import { createAuditLog } from "../../lib/audit";

/**
 * Normalize a share's resource type. Legacy rows created before shared
 * accounts have no `resourceType` field and are always variable shares.
 */
export function normalizeResourceType(share: {
  resourceType?: "variable" | "account";
}): "variable" | "account" {
  return share.resourceType ?? "variable";
}

// Upper bound on shares scanned by the list queries. Beyond this the oldest/
// least-relevant rows are dropped rather than blowing the per-query read
// budget; share lists are dashboards, not exhaustive exports.
export const MAX_SHARE_SCAN = 500;

/**
 * Compute the caller's effective access ("read" | "write") to a batch of
 * variables in the fewest reads possible, mirroring authz.getVariableAccess
 * exactly. Callers pass the variableIds referenced by a set of shares; the
 * returned map only contains entries the caller can access (deleted variables,
 * missing projects, and no-access cases are omitted).
 *
 * Reads: variables (deduped) + projects (deduped) + one org-membership lookup
 * per distinct org + one project-membership lookup per distinct project + ONE
 * variablePermissions scan (by_user_active) for the caller's grants — instead
 * of getVariableAccess's full read fan-out per share.
 */
async function buildVariableAccessMap(
  ctx: QueryCtx,
  userId: Id<"users">,
  variableIds: Id<"environmentVariables">[]
): Promise<Map<string, "read" | "write">> {
  const now = Date.now();

  // Variables (deduped), dropping deleted ones.
  const uniqueVarIds = [...new Set(variableIds.map((id) => id.toString()))];
  const variableDocs = await Promise.all(
    uniqueVarIds.map((id) => ctx.db.get(id as Id<"environmentVariables">))
  );
  const varMap = new Map<string, Doc<"environmentVariables">>();
  for (const variable of variableDocs) {
    if (variable && !variable.deletedAt) {
      varMap.set(variable._id.toString(), variable);
    }
  }

  // Projects (deduped), dropping deleted ones.
  const projectIds = [
    ...new Set([...varMap.values()].map((va) => va.projectId.toString())),
  ];
  const projectDocs = await Promise.all(
    projectIds.map((id) => ctx.db.get(id as Id<"projects">))
  );
  const projMap = new Map<string, Doc<"projects">>();
  for (const project of projectDocs) {
    if (project && !project.deletedAt) {
      projMap.set(project._id.toString(), project);
    }
  }

  // Caller's org membership, one lookup per distinct org.
  const orgIds = [
    ...new Set([...projMap.values()].map((p) => p.organizationId.toString())),
  ];
  const membershipMap = new Map<string, Doc<"organizationMembers"> | null>();
  await Promise.all(
    orgIds.map(async (orgId) => {
      // Suspended members map to null → share access maps deny them, same as
      // a non-member.
      const membership = await getActiveMembership(
        ctx,
        orgId as Id<"organizations">,
        userId
      );
      membershipMap.set(orgId, membership);
    })
  );

  // Caller's project membership, one lookup per distinct project.
  const projMemberMap = new Map<string, Doc<"projectMembers"> | null>();
  await Promise.all(
    projectIds.map(async (projectId) => {
      const pm = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", projectId as Id<"projects">).eq("userId", userId)
        )
        .first();
      projMemberMap.set(projectId, pm);
    })
  );

  // Caller's active, unexpired grants — a single indexed scan, keyed by
  // variableId (mirrors authz.getActiveVariableGrant's active+unexpired rule).
  const grants = await ctx.db
    .query("variablePermissions")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .collect();
  const grantMap = new Map<string, Doc<"variablePermissions">>();
  for (const grant of grants) {
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.variableId.toString();
    if (!grantMap.has(key)) grantMap.set(key, grant);
  }

  const accessMap = new Map<string, "read" | "write">();
  const profileMemo = new Map<string, RoleProfile>();
  for (const variable of varMap.values()) {
    const project = projMap.get(variable.projectId.toString());
    if (!project) continue; // missing/deleted project → no access

    const membership = membershipMap.get(project.organizationId.toString());
    if (!membership) continue; // not an org member → no access

    const role = normalizeOrgRole(membership.role);
    // Memoized per role slug — one registry read per distinct role in the
    // batch, never per row (cost rule).
    let profile = profileMemo.get(role);
    if (!profile) {
      profile = await getRoleProfile(ctx, role);
      profileMemo.set(role, profile);
    }
    if (bypassesAssignment(profile)) {
      accessMap.set(variable._id.toString(), "write");
      continue;
    }

    const projectMembership = projMemberMap.get(variable.projectId.toString());

    if (
      projectMembership &&
      hasCapability(profile, "project.variables.update")
    ) {
      accessMap.set(variable._id.toString(), "write");
      continue;
    }

    // Env-scopeable roles never see out-of-scope vars.
    if (
      projectMembership &&
      !isEnvironmentScopeAllowed(
        effectiveEnvironments(profile, projectMembership.environments),
        variable.environments
      )
    ) {
      continue;
    }

    // Auditor class: blanket read on in-scope resources.
    if (projectMembership && hasCapability(profile, "access.blanket_read")) {
      accessMap.set(variable._id.toString(), "read");
      continue;
    }

    const grant = grantMap.get(variable._id.toString());
    if (!grant) continue; // no grant → no access

    // Unassigned members are capped at read (per-variable viewer sharing).
    if (!projectMembership) {
      accessMap.set(variable._id.toString(), "read");
      continue;
    }

    accessMap.set(
      variable._id.toString(),
      grant.permission === "read"
        ? "read"
        : hasCapability(profile, "access.grant_fallback")
          ? "write"
          : "read"
    );
  }

  return accessMap;
}

/**
 * Account analog of buildVariableAccessMap. Batch-resolves the caller's
 * "read"/"write" access to a set of accountIds in the fewest reads possible,
 * mirroring authz.getAccountAccess exactly. The returned map only contains
 * entries the caller can access (deleted accounts, missing projects, and
 * no-access cases are omitted).
 */
async function buildAccountAccessMap(
  ctx: QueryCtx,
  userId: Id<"users">,
  accountIds: Id<"projectAccounts">[]
): Promise<Map<string, "read" | "write">> {
  const now = Date.now();

  // Accounts (deduped), dropping deleted ones.
  const uniqueAccountIds = [...new Set(accountIds.map((id) => id.toString()))];
  const accountDocs = await Promise.all(
    uniqueAccountIds.map((id) => ctx.db.get(id as Id<"projectAccounts">))
  );
  const acctMap = new Map<string, Doc<"projectAccounts">>();
  for (const account of accountDocs) {
    if (account && !account.deletedAt) {
      acctMap.set(account._id.toString(), account);
    }
  }

  // Projects (deduped), dropping deleted ones.
  const projectIds = [
    ...new Set([...acctMap.values()].map((a) => a.projectId.toString())),
  ];
  const projectDocs = await Promise.all(
    projectIds.map((id) => ctx.db.get(id as Id<"projects">))
  );
  const projMap = new Map<string, Doc<"projects">>();
  for (const project of projectDocs) {
    if (project && !project.deletedAt) {
      projMap.set(project._id.toString(), project);
    }
  }

  // Caller's org membership, one lookup per distinct org.
  const orgIds = [
    ...new Set([...projMap.values()].map((p) => p.organizationId.toString())),
  ];
  const membershipMap = new Map<string, Doc<"organizationMembers"> | null>();
  await Promise.all(
    orgIds.map(async (orgId) => {
      // Suspended members map to null → share access maps deny them, same as
      // a non-member.
      const membership = await getActiveMembership(
        ctx,
        orgId as Id<"organizations">,
        userId
      );
      membershipMap.set(orgId, membership);
    })
  );

  // Caller's project membership, one lookup per distinct project.
  const projMemberMap = new Map<string, Doc<"projectMembers"> | null>();
  await Promise.all(
    projectIds.map(async (projectId) => {
      const pm = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", projectId as Id<"projects">).eq("userId", userId)
        )
        .first();
      projMemberMap.set(projectId, pm);
    })
  );

  // Caller's active, unexpired account grants — a single indexed scan, keyed
  // by accountId (mirrors authz.getActiveAccountGrant's active+unexpired rule).
  const grants = await ctx.db
    .query("accountPermissions")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", userId).eq("isActive", true)
    )
    .collect();
  const grantMap = new Map<string, Doc<"accountPermissions">>();
  for (const grant of grants) {
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.accountId.toString();
    if (!grantMap.has(key)) grantMap.set(key, grant);
  }

  const accessMap = new Map<string, "read" | "write">();
  const profileMemo = new Map<string, RoleProfile>();
  for (const account of acctMap.values()) {
    const project = projMap.get(account.projectId.toString());
    if (!project) continue; // missing/deleted project → no access

    const membership = membershipMap.get(project.organizationId.toString());
    if (!membership) continue; // not an org member → no access

    const role = normalizeOrgRole(membership.role);
    // Memoized per role slug — one registry read per distinct role in the
    // batch, never per row (cost rule).
    let profile = profileMemo.get(role);
    if (!profile) {
      profile = await getRoleProfile(ctx, role);
      profileMemo.set(role, profile);
    }
    if (bypassesAssignment(profile)) {
      accessMap.set(account._id.toString(), "write");
      continue;
    }

    const projectMembership = projMemberMap.get(account.projectId.toString());

    if (
      projectMembership &&
      hasCapability(profile, "project.accounts.update")
    ) {
      accessMap.set(account._id.toString(), "write");
      continue;
    }

    // Env-scopeable roles never see out-of-scope accounts.
    if (
      projectMembership &&
      !isEnvironmentScopeAllowed(
        effectiveEnvironments(profile, projectMembership.environments),
        account.environments
      )
    ) {
      continue;
    }

    // Auditor class: blanket read on in-scope resources.
    if (projectMembership && hasCapability(profile, "access.blanket_read")) {
      accessMap.set(account._id.toString(), "read");
      continue;
    }

    const grant = grantMap.get(account._id.toString());
    if (!grant) continue; // no grant → no access

    // Unassigned members are capped at read (per-account viewer sharing).
    if (!projectMembership) {
      accessMap.set(account._id.toString(), "read");
      continue;
    }

    accessMap.set(
      account._id.toString(),
      grant.permission === "read"
        ? "read"
        : hasCapability(profile, "access.grant_fallback")
          ? "write"
          : "read"
    );
  }

  return accessMap;
}

/**
 * Partition a batch of shares by resource type and resolve the caller's access
 * to each underlying resource in one batched pass per type. Returns two maps
 * (variableId → access, accountId → access) that isShareAccessible consults.
 */
export async function buildShareAccessMaps(
  ctx: QueryCtx,
  userId: Id<"users">,
  shares: Doc<"sharedSecrets">[]
): Promise<{
  variableAccess: Map<string, "read" | "write">;
  accountAccess: Map<string, "read" | "write">;
}> {
  const variableIds: Id<"environmentVariables">[] = [];
  const accountIds: Id<"projectAccounts">[] = [];
  for (const share of shares) {
    if (normalizeResourceType(share) === "account") {
      if (share.accountId) accountIds.push(share.accountId);
    } else if (share.variableId) {
      variableIds.push(share.variableId);
    }
  }

  const [variableAccess, accountAccess] = await Promise.all([
    buildVariableAccessMap(ctx, userId, variableIds),
    buildAccountAccessMap(ctx, userId, accountIds),
  ]);

  return { variableAccess, accountAccess };
}

/**
 * Whether the caller can access the resource a share points at, using the
 * pre-resolved access maps from buildShareAccessMaps.
 */
export function isShareAccessible(
  share: Doc<"sharedSecrets">,
  variableAccess: Map<string, "read" | "write">,
  accountAccess: Map<string, "read" | "write">
): boolean {
  if (normalizeResourceType(share) === "account") {
    return !!share.accountId && accountAccess.has(share.accountId.toString());
  }
  return !!share.variableId && variableAccess.has(share.variableId.toString());
}

// ==========================================
// INTERNAL HELPERS
// ==========================================

export async function countActiveShares(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  // Exclude rows already past their TTL: the hourly cleanup cron only flips
  // expired→"expired" once an hour, so an "active" row can be effectively dead
  // for up to an hour. Counting it would wrongly block new shares at the cap.
  const now = Date.now();
  const shares = (
    await db
      .query("sharedSecrets")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect()
  ).filter((share) => share.status === "active" && share.expiresAt > now);
  return shares.length;
}

/**
 * Revoke every active share pointing at a resource that is being (soft-)deleted.
 * Called from the variable / account delete mutations so a deleted resource's
 * share links stop working AND disappear from the owner's dashboard (the list
 * queries hide shares whose resource is gone, which would otherwise strand a
 * live, un-revokable link). Patches status→"revoked" + audit; the vault
 * ciphertext is left for the same GC path that non-purged expired shares use,
 * and verifyOtp independently rejects deleted resources as a backstop.
 */
export async function revokeSharesForResource(
  ctx: MutationCtx,
  args:
    | {
        resourceType: "variable";
        variableId: Id<"environmentVariables">;
        actorId: Id<"users">;
      }
    | {
        resourceType: "account";
        accountId: Id<"projectAccounts">;
        actorId: Id<"users">;
      }
): Promise<number> {
  const now = Date.now();
  const shares =
    args.resourceType === "account"
      ? await ctx.db
          .query("sharedSecrets")
          .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
          .collect()
      : await ctx.db
          .query("sharedSecrets")
          .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
          .collect();

  let revoked = 0;
  for (const share of shares) {
    if (share.status !== "active") continue;
    await ctx.db.patch(share._id, {
      status: "revoked",
      revokedAt: now,
      revokedBy: args.actorId,
    });
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      variableId: share.variableId,
      userId: args.actorId,
      action: "share.revoked",
      details: {
        resourceType: normalizeResourceType(share),
        accountId: share.accountId,
        variableKey: share.variableKey,
        mode: share.mode,
        reason: "resource_deleted",
      },
      involvesSensitiveData: true,
      resourceType: "security",
    });
    revoked++;
  }
  return revoked;
}
