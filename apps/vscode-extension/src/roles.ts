// Unified role model — VS Code extension mirror of apps/cli/src/lib/roles.ts /
// convex/authz.ts. Keep in sync with those.
//
// ONE org role per user: owner > project_manager > team_lead > editor >
// developer > viewer. What a user can do in a project follows from this role
// plus whether they are assigned to it; editors get blanket write in assigned
// projects, developers are read + request-only, viewers are read-only, and a
// developer's assignment can be scoped to specific environments.
//
// Legacy extensions/servers use "admin"/"team_lead"/"member" (org) and
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

/** VS Code file-protection modes consumed by FileProtectionService. */
export type ProtectionMode =
  | "writable"
  | "readonly-with-request"
  | "strict-readonly";

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
 * API response (never from a stale cached value). Drives file protection and
 * command gating.
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
   * Whether the user holds a write path to the variables — via role
   * (owner/PM/TL assigned) or a per-variable write grant.
   */
  hasWriteAccess: boolean;
}

/**
 * Whether the pulled .env should be writable for this user.
 *
 * Owners have implicit access to every project and are always writable (the
 * legacy server sends no assignment info for owners, so gating on `assigned`
 * here would wrongly lock an owner's file read-only). Project managers and
 * team leads need assignment; editors, developers, and viewers ride the
 * server's hasWriteAccess meta boolean (editors get true, developers and
 * viewers get false under the request-only model).
 */
export function isFileWritable(access: ProjectAccess): boolean {
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

/**
 * Map a ProjectAccess to a VS Code file-protection mode.
 *
 *   writable              — can edit the .env in place (owner/PM/TL, an editor
 *                           with hasWriteAccess, or a developer with write
 *                           access)
 *   readonly-with-request — assigned developer without write access; can
 *                           request a variable from the request dialog
 *   strict-readonly       — everyone else: viewers (cannot request), no
 *                           project assignment, not a member of the project
 */
export function fileProtectionMode(access: ProjectAccess): ProtectionMode {
  if (isFileWritable(access)) return "writable";
  if (access.role === "developer" && access.assigned) {
    return "readonly-with-request";
  }
  return "strict-readonly";
}
