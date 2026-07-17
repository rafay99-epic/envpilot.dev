import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
  profileToLegacyProjectRole,
  hasCapability,
  type RoleProfile,
} from "../../lib/authz";

/**
 * Environment Variable shared helpers
 */

/**
 * Throw when a scoped developer touches environments outside their assignment
 * scope. No-op for unrestricted (undefined) scopes — see authz.ts.
 */
export function assertWithinEnvironmentScope(
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
 * Build a variableId → active grant lookup from a caller's grant rows.
 *
 * Collapses the same (variable, user) revocation history that
 * getActiveVariableGrant scans per call into a single Map so list queries
 * can resolve grants without an indexed read per variable. Mirrors
 * getActiveVariableGrant's selection exactly: only rows that are active and
 * unexpired qualify, and the first such row per variable wins (matching its
 * `.find(...)`). Callers should pass rows already filtered to isActive=true
 * (e.g. via the by_user_active index).
 */
export function buildActiveGrantMap(
  grants: Doc<"variablePermissions">[]
): Map<string, Doc<"variablePermissions">> {
  const now = Date.now();
  const byVariable = new Map<string, Doc<"variablePermissions">>();
  for (const grant of grants) {
    if (!grant.isActive) continue;
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    const key = grant.variableId as string;
    if (!byVariable.has(key)) byVariable.set(key, grant);
  }
  return byVariable;
}

type OrgRole = ReturnType<typeof normalizeOrgRole>;
type ProjectRole = ReturnType<typeof profileToLegacyProjectRole>;

/**
 * The per-project access context shared by listWithAccess and
 * listWithAccessPaginated: the caller's resolved unified role, project
 * assignment/scope, blanket-access flags, and a prefetched grant map. Both
 * queries source their variable page differently (take vs paginate) but
 * derive every per-row access decision from this identical context.
 */
export type VariableAccessContext = {
  orgRole: OrgRole;
  /** Resolved capability profile — the single per-request resolution. */
  profile: RoleProfile;
  isOwner: boolean;
  assigned: boolean;
  environmentScope: string[] | undefined;
  roleAccess: boolean;
  canManagePermissions: boolean;
  projectRole: ProjectRole;
  grantByVariable: Map<string, Doc<"variablePermissions">>;
};

/**
 * Resolve the caller's access context for a single project, shared verbatim by
 * listWithAccess (take-windowed) and listWithAccessPaginated (cursor-paged).
 *
 * Returns null when the project is missing/deleted or the caller is not an org
 * member — each caller maps that to its own "empty" shape (an empty array for
 * the take variant, an empty pagination result for the paginated variant),
 * preserving both queries' existing early-return behavior exactly.
 */
export async function resolveProjectAccessContext(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
): Promise<{ project: Doc<"projects">; access: VariableAccessContext } | null> {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    return null;
  }

  // Get user's org membership to determine their unified role. A suspended
  // member resolves to null here — the security-hold denial for the highest
  // -traffic variable read paths (listWithAccess and its paginated sibling).
  const membership = await getActiveMembership(
    ctx,
    project.organizationId,
    userId
  );

  if (!membership) {
    return null;
  }

  const orgRole = normalizeOrgRole(membership.role);
  // ONE profile resolution per request (cost rule) — every per-row decision
  // below derives from this context, never from slug comparisons.
  const profile = await getRoleProfile(ctx, orgRole);
  const isOwner = bypassesAssignment(profile);

  // Assignment is a pure scope check — projectMembers.role is legacy
  // and never consulted for authorization.
  let assigned = false;
  let environmentScope: string[] | undefined;
  if (!isOwner) {
    const projectMembership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", projectId).eq("userId", userId)
      )
      .first();
    assigned = !!projectMembership;
    // Environment scope constrains env-scopeable roles
    if (hasCapability(profile, "access.env_scoped")) {
      environmentScope = projectMembership?.environments;
    }
  }

  // The owner class and assigned blanket-write roles have write access
  const roleAccess =
    isOwner || (assigned && hasCapability(profile, "project.variables.update"));
  const canManagePermissions =
    isOwner ||
    (assigned && hasCapability(profile, "project.permissions.manage"));
  const projectRole = profileToLegacyProjectRole(profile, assigned || isOwner);

  // Prefetch the caller's active grants ONCE instead of one indexed query
  // per variable (getActiveVariableGrant N+1). by_user_active already
  // filters to isActive=true; drop expired grants and dedupe to the first
  // active/unexpired grant per variable — the exact row
  // getActiveVariableGrant would have returned.
  const grantByVariable = buildActiveGrantMap(
    await ctx.db
      .query("variablePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", userId).eq("isActive", true)
      )
      .collect()
  );

  return {
    project,
    access: {
      orgRole,
      profile,
      isOwner,
      assigned,
      environmentScope,
      roleAccess,
      canManagePermissions,
      projectRole,
      grantByVariable,
    },
  };
}

/**
 * Map one variable to the access-annotated row shape shared by listWithAccess
 * and listWithAccessPaginated.
 *
 * Mirrors getVariableAccess: owner → write; assigned PM/TL → write; developers
 * per grant; unassigned grant holders capped at read. Vault refs are only
 * returned for variables the user can access; assigned members still see
 * metadata for the rest.
 */
export function mapVariableRow(
  variable: Doc<"environmentVariables">,
  access: VariableAccessContext
) {
  const {
    roleAccess,
    profile,
    assigned,
    orgRole,
    projectRole,
    canManagePermissions,
    grantByVariable,
  } = access;

  const grant = grantByVariable.get(variable._id as string) ?? null;

  let effectiveAccess: "write" | "read" | null = null;
  if (roleAccess) {
    effectiveAccess = "write";
  } else if (assigned && hasCapability(profile, "access.blanket_read")) {
    // Auditor class: every in-scope variable, read-only, no grants involved.
    effectiveAccess = "read";
  } else if (grant) {
    effectiveAccess =
      !assigned || grant.permission === "read"
        ? "read"
        : hasCapability(profile, "access.grant_fallback")
          ? "write"
          : "read";
  }

  const hasAccess = effectiveAccess !== null;
  // "admin" marks rows whose holder may manage permissions — decoupled from
  // blanket write so write-only roles never surface management UI.
  const effectivePermission = canManagePermissions
    ? "admin"
    : roleAccess
      ? "write"
      : effectiveAccess;

  const { vaultRef, ...metadata } = variable;

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
}

/**
 * Per-environment key uniqueness: the same key MAY exist on multiple active
 * variables in a project as long as their `environments` arrays are disjoint
 * (e.g. DATABASE_URL for [development] and DATABASE_URL for [production] are
 * two variables with independent values). This helper returns the list of
 * environments that would clash for a proposed (key, environments) pair —
 * empty result means the create/update is allowed. The invariant this
 * preserves: every (key, environment) pair resolves to AT MOST ONE active
 * variable, which keeps CLI pull/push, extension sync, and the public API
 * deterministic without any client changes.
 */
export async function findEnvironmentConflicts(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    key: string;
    environments: string[];
    excludeVariableId?: Id<"environmentVariables">;
  }
): Promise<string[]> {
  const sameKey = await ctx.db
    .query("environmentVariables")
    .withIndex("by_project_and_key", (q) =>
      q.eq("projectId", args.projectId).eq("key", args.key)
    )
    .collect();

  const clashes = new Set<string>();
  for (const existing of sameKey) {
    if (existing.deletedAt) continue;
    if (args.excludeVariableId && existing._id === args.excludeVariableId) {
      continue;
    }
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }
  return [...clashes];
}

/** Standard user-facing message for a per-environment key clash. */
export function environmentConflictMessage(
  key: string,
  clashes: string[]
): string {
  return `Variable "${key}" already exists in environment(s): ${clashes.join(", ")}. The same key is allowed only across non-overlapping environments.`;
}
