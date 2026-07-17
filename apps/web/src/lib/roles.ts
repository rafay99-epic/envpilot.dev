// Unified role model — web-side mirror of convex/lib/authz.ts.
//
// Roles are OPEN slugs backed by the roleRegistry table. The registry is the
// source of truth for display metadata (listAssignableRoles / getMyPermissions
// roleMeta); the maps below are static fallbacks for the SEEDED slugs and
// numeric floors for gates that compare against a known system level.

export type OrgRole = string;
export type VariablePermission = "read" | "write";

/**
 * Registry levels for the SEEDED slugs — static floors for client gates
 * ("team_lead and above") without a server round-trip. Unknown/custom slugs
 * resolve to 0 (fail closed) — compare those via the server-resolved
 * roleMeta.level instead.
 */
export const ROLE_LEVEL: Record<string, number> = {
  owner: 100,
  project_manager: 80,
  team_lead: 60,
  editor: 50,
  developer: 40,
  viewer: 20,
};

/** Fallback display names for the seeded slugs — registry meta wins. */
export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  project_manager: "Project Manager",
  team_lead: "Team Lead",
  editor: "Editor",
  developer: "Developer",
  viewer: "Viewer",
};

/** Fallback descriptions for the seeded slugs — registry meta wins. */
export const ORG_ROLE_DESCRIPTIONS: Record<string, string> = {
  owner: "Full control over the organization and every project",
  project_manager:
    "Full control over their assigned projects; manages team leads and developers",
  team_lead:
    "Manages variables and developer access in their assigned projects",
  editor:
    "Creates and edits variables and accounts in assigned projects; no member, permission, approval, or sharing powers",
  developer:
    "Works in assigned projects; variable values require explicit access grants",
  viewer:
    "Sees everything in assigned projects; cannot change, request, or share anything",
};

/** Fallback registry color token per seeded slug (custom roles: zinc). */
export const ROLE_FALLBACK_COLOR: Record<string, string> = {
  owner: "purple",
  project_manager: "amber",
  team_lead: "blue",
  editor: "teal",
  developer: "zinc",
  viewer: "slate",
};

/**
 * Seeded slugs whose project access is environment-scopeable — fallback for
 * UIs that only have a slug; prefer the registry's envScoped flag
 * (capabilities["access.env_scoped"]) when available.
 */
export const ENV_SCOPED_ROLE_FALLBACK: ReadonlySet<string> = new Set([
  "developer",
  "editor",
  "viewer",
]);

/**
 * Map legacy role values (pre-migration data or old clients) onto slugs.
 * Unknown slugs PASS THROUGH — the registry decides what they mean.
 * Only truly empty values fall back to "developer".
 */
export function normalizeOrgRole(role: string | null | undefined): OrgRole {
  switch (role) {
    case "admin":
      return "owner";
    case "member":
      return "developer";
    case "":
    case null:
    case undefined:
      return "developer";
    default:
      return role;
  }
}

export function roleLevel(role: string | null | undefined): number {
  return ROLE_LEVEL[normalizeOrgRole(role)] ?? 0;
}

/** Display label: registry-seeded fallback, else the humanized slug. */
export function roleLabel(role: string | null | undefined): string {
  const slug = normalizeOrgRole(role);
  return (
    ORG_ROLE_LABELS[slug] ??
    slug.replace(/[_-]+/g, " ").replace(/(^|\s)\w/g, (c) => c.toUpperCase())
  );
}

/**
 * Registry color token → badge pill classes. Unknown tokens render zinc —
 * never crash on a custom role.
 */
export function roleBadgeColor(colorToken: string): string {
  switch (colorToken) {
    case "purple":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "amber":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "blue":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "teal":
      return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";
    case "green":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "red":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    case "slate":
      return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
    default:
      return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400";
  }
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
    default:
      // Custom/unknown slugs map to the least-privileged legacy role.
      return "member";
  }
}

/**
 * Legacy per-project role for old clients: writable roles map to "manager"
 * (writable .env), everything else maps to "developer" (readonly-with-request),
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
    default:
      return "developer";
  }
}
