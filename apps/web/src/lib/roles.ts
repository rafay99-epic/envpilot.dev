// Unified role model — web-side mirror of convex/authz.ts.
//
// ONE role per user (stored on organizationMembers.role). Project scope comes
// from projectMembers assignments; per-variable view/edit sharing comes from
// variablePermissions grants.

export type OrgRole = "owner" | "project_manager" | "team_lead" | "developer";
export type VariablePermission = "read" | "write";

export const ORG_ROLES: OrgRole[] = [
  "owner",
  "project_manager",
  "team_lead",
  "developer",
];

export const ROLE_LEVEL: Record<OrgRole, number> = {
  owner: 4,
  project_manager: 3,
  team_lead: 2,
  developer: 1,
};

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  developer: "Developer",
};

export const ORG_ROLE_DESCRIPTIONS: Record<OrgRole, string> = {
  owner: "Full control over the organization and every project",
  project_manager:
    "Full control over their assigned projects; manages team leads and developers",
  team_lead:
    "Manages variables and developer access in their assigned projects",
  developer:
    "Works in assigned projects; variable values require explicit access grants",
};

/** Map legacy role values (pre-migration data or old clients) onto the unified model. */
export function normalizeOrgRole(role: string | null | undefined): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case "owner":
    case "project_manager":
    case "team_lead":
    case "developer":
      return role;
    default:
      return "developer";
  }
}

export function roleLevel(role: string | null | undefined): number {
  return ROLE_LEVEL[normalizeOrgRole(role)];
}

/** Roles an actor is allowed to assign/invite. Owners can assign anything. */
export function assignableRoles(
  actorRole: string | null | undefined
): OrgRole[] {
  const actor = normalizeOrgRole(actorRole);
  if (actor === "owner") return [...ORG_ROLES];
  return ORG_ROLES.filter((r) => ROLE_LEVEL[r] < ROLE_LEVEL[actor]);
}

// ─── Legacy client compatibility ──────────────────────────────────────────────
//
// Deployed CLI / VS Code extension builds hardcode the old role strings
// ("admin" | "team_lead" | "member" and "manager" | "developer" | "viewer")
// and derive OS-level .env file protection from them. The /api/cli/* and
// /api/extension/* routes translate through these until those clients ship
// with the unified model.

export type LegacyOrgRole = "admin" | "team_lead" | "member";
export type LegacyProjectRole = "manager" | "developer" | "viewer";

export function toLegacyOrgRole(
  role: string | null | undefined
): LegacyOrgRole {
  switch (normalizeOrgRole(role)) {
    case "owner":
      return "admin";
    case "project_manager":
    case "team_lead":
      return "team_lead";
    case "developer":
      return "member";
  }
}

/**
 * Legacy per-project role for old clients: writable roles map to "manager"
 * (writable .env), developers map to "developer" (readonly-with-request),
 * unassigned users get null.
 */
export function toLegacyProjectRole(
  role: string | null | undefined,
  assigned: boolean
): LegacyProjectRole | null {
  if (!assigned) return null;
  switch (normalizeOrgRole(role)) {
    case "owner":
    case "project_manager":
    case "team_lead":
      return "manager";
    case "developer":
      return "developer";
  }
}
