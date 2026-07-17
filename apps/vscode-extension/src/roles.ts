// Registry-driven role model — VS Code extension mirror of
// apps/cli/src/lib/roles.ts / convex/lib/authz.ts. Keep in sync with those.
//
// Roles are rows in the server-side role registry (an OPEN slug set — custom
// roles exist), so role slugs pass through untouched and the server-provided
// capability map / meta booleans are the authority on what a user can do.
// Legacy extensions/servers use "admin"/"team_lead"/"member" (org) — always
// normalize before comparing.

/** Open registry slug set — any string can be a role. */
export type OrgRole = string;
export type VariablePermission = "read" | "write";
export type LegacyOrgRole = "admin" | "team_lead" | "member";
export type LegacyProjectRole = "manager" | "developer" | "viewer";

/** VS Code file-protection modes consumed by FileProtectionService. */
export type ProtectionMode =
  | "writable"
  | "readonly-with-request"
  | "strict-readonly";

/**
 * Seeded registry levels (mirrors convex/lib/authz.ts). Custom roles are not
 * listed — roleLevel() returns 0 for them (fail-closed for level comparisons;
 * capabilities are the real authority).
 */
export const ROLE_LEVEL: Record<string, number> = {
  owner: 100,
  project_manager: 80,
  team_lead: 60,
  editor: 50,
  developer: 40,
  viewer: 20,
};

/**
 * Map a role string onto the registry slug set. Legacy strings are translated;
 * unknown slugs PASS THROUGH (custom registry roles); only a missing/empty
 * role falls back to "developer".
 */
export function normalizeOrgRole(role: string | null | undefined): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case undefined:
    case null:
    case "":
      return "developer";
    default:
      return role;
  }
}

/** Registry level for a role; unknown/custom slugs rank 0 (fail-closed). */
export function roleLevel(role: string | null | undefined): number {
  return ROLE_LEVEL[normalizeOrgRole(role)] ?? 0;
}

/**
 * Human-readable label for any role string. Prefers a server-provided display
 * name when given; otherwise humanizes the slug (snake_case → Title Case).
 */
export function formatRoleLabel(
  role: string | null | undefined,
  meta?: { displayName?: string | null }
): string {
  if (meta?.displayName) return meta.displayName;
  return normalizeOrgRole(role)
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Access facts for the current user on a specific project, resolved from the
 * API response (never from a stale cached value). Drives file protection and
 * command gating.
 */
export interface ProjectAccess {
  /** The user's org role slug (registry-driven, open set). */
  role: OrgRole;
  /** Whether the user is assigned to the project (owners are implicitly true). */
  assigned: boolean;
  /**
   * Environment scope for a scoped assignment (e.g. ["development","staging"]).
   * null/undefined = unrestricted.
   */
  environmentScope?: string[] | null;
  /**
   * Whether the user holds a write path to the variables — the server computes
   * this from the role's capabilities and per-variable write grants, so it is
   * authoritative for custom roles too.
   */
  hasWriteAccess: boolean;
}

/**
 * Whether the pulled .env should be writable for this user.
 *
 * Owners are always writable (implicit access to every project — the legacy
 * server sends no assignment info for them). Assigned project managers and
 * team leads are writable by role. Every other role — developer, editor,
 * viewer, and custom registry roles — defers to the server-computed
 * hasWriteAccess.
 */
export function isFileWritable(access: ProjectAccess): boolean {
  if (access.role === "owner") return true;
  if (!access.assigned) return false;
  switch (access.role) {
    case "project_manager":
    case "team_lead":
      return true;
    default:
      return access.hasWriteAccess;
  }
}

/**
 * Map a ProjectAccess to a VS Code file-protection mode.
 *
 *   writable              — can edit the .env in place
 *   readonly-with-request — read-only, but may submit a variable request
 *   strict-readonly       — read-only, no request path
 *
 * When the server sent a capability map (registry roles, including custom
 * ones) it is the authority: hasWriteAccess decides writability and the
 * "project.requests.submit" capability decides request eligibility. Without
 * capabilities (older servers), falls back to the legacy role-based rules.
 */
export function fileProtectionMode(
  access: ProjectAccess,
  capabilities?: Record<string, boolean> | null
): ProtectionMode {
  if (capabilities) {
    if (access.hasWriteAccess) return "writable";
    return capabilities["project.requests.submit"] === true
      ? "readonly-with-request"
      : "strict-readonly";
  }
  if (isFileWritable(access)) return "writable";
  if (normalizeOrgRole(access.role) === "developer" && access.assigned) {
    return "readonly-with-request";
  }
  return "strict-readonly";
}
