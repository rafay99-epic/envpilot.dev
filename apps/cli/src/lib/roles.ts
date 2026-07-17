// Unified role model — CLI mirror of apps/web/src/lib/roles.ts / convex/authz.ts.
//
// ONE org role per user: owner > project_manager > team_lead > editor >
// developer > viewer. What a user can do in a project follows from this role
// plus whether they are assigned to it; editors get blanket write in assigned
// projects, developers are read + request-only, viewers are read-only, and a
// developer's assignment can be scoped to specific environments.
//
// Legacy CLIs/servers use "admin"/"team_lead"/"member" (org) and
// "manager"/"developer"/"viewer" (project). Always normalize before comparing.

export type OrgRole =
  | "owner"
  | "project_manager"
  | "team_lead"
  | "editor"
  | "developer"
  | "viewer";
export type VariablePermission = "read" | "write";
export type LegacyOrgRole = "admin" | "team_lead" | "member";
export type LegacyProjectRole = "manager" | "developer" | "viewer";

export const ROLE_LEVEL: Record<OrgRole, number> = {
  owner: 6,
  project_manager: 5,
  team_lead: 4,
  editor: 3,
  developer: 2,
  viewer: 1,
};

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  editor: "Editor",
  developer: "Developer",
  viewer: "Viewer",
};

/** Map any legacy or unified role string onto the unified model. */
export function normalizeOrgRole(role: string | null | undefined): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case "owner":
    case "project_manager":
    case "team_lead":
    case "editor":
    case "developer":
    case "viewer":
      return role;
    default:
      return "developer";
  }
}

export function roleLevel(role: string | null | undefined): number {
  return ROLE_LEVEL[normalizeOrgRole(role)];
}

/** Human-readable label for any role string (normalizes legacy values). */
export function formatRoleLabel(role: string | null | undefined): string {
  return ORG_ROLE_LABELS[normalizeOrgRole(role)];
}

/**
 * Access facts for the current user on a specific project, resolved from the
 * API response (never from a stale global config value). This is what drives
 * file protection and command gating.
 */
export interface ProjectAccess {
  /** The user's unified org role. */
  role: OrgRole;
  /** Whether the user is assigned to the project (owners are implicitly true). */
  assigned: boolean;
  /**
   * Environment scope for a scoped developer (e.g. ["development","staging"]).
   * null/undefined = unrestricted. Only meaningful for developers.
   */
  environmentScope?: string[] | null;
  /**
   * Whether the user holds at least one write path to the pulled variables —
   * either via role (owner/PM/TL assigned) or a per-variable write grant.
   */
  hasWriteAccess: boolean;
}

/**
 * Decide whether a pulled .env file should be writable for this user.
 *
 * Owners, project managers, and team leads assigned to the project get a
 * writable file. Editors, developers, and viewers ride the server's
 * hasWriteAccess meta boolean (the authority): editors get true, developers
 * and viewers get false under the request-only model. Unassigned users get a
 * read-only file.
 */
export function isFileWritable(access: ProjectAccess): boolean {
  // Owners have implicit access to every project — never gated on assignment.
  // (The legacy server sends no `assigned`/`projectRole` for owners, so gating
  // on `assigned` here would wrongly lock an owner's pulled .env read-only.)
  if (access.role === "owner") return true;
  if (!access.assigned) return false;
  switch (access.role) {
    case "project_manager":
    case "team_lead":
      return true;
    case "editor":
    case "developer":
    case "viewer":
      return access.hasWriteAccess;
  }
}
