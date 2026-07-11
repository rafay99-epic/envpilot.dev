import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
  toLegacyProjectRole,
  getActiveMembership,
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
type ProjectRole = ReturnType<typeof toLegacyProjectRole>;

/**
 * The per-project access context shared by listWithAccess and
 * listWithAccessPaginated: the caller's resolved unified role, project
 * assignment/scope, blanket-access flags, and a prefetched grant map. Both
 * queries source their variable page differently (take vs paginate) but
 * derive every per-row access decision from this identical context.
 */
export type VariableAccessContext = {
  orgRole: OrgRole;
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
  const isOwner = orgRole === "owner";

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
  } else if (grant) {
    effectiveAccess =
      !assigned || grant.permission === "read" ? "read" : "write";
  }

  const hasAccess = effectiveAccess !== null;
  const effectivePermission = roleAccess ? "admin" : effectiveAccess;

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
