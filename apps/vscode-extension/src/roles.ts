export type OrgRole = string;

export type ProtectionMode =
  | "writable"
  | "readonly-with-request"
  | "strict-readonly";

export const ROLE_LEVEL = {
  owner: 100,
  project_manager: 80,
  team_lead: 60,
  editor: 50,
  developer: 40,
  viewer: 20,
} as const satisfies Record<string, number>;

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

export function roleLevel(role: string | null | undefined): number {
  const levels: Readonly<Record<string, number>> = ROLE_LEVEL;
  return levels[normalizeOrgRole(role)] ?? 0;
}

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

export interface ProjectAccess {
  role: OrgRole;
  assigned: boolean;
  environmentScope?: string[] | null;
  hasWriteAccess: boolean;
}

export function isFileWritable(access: ProjectAccess): boolean {
  const role = normalizeOrgRole(access.role);
  if (role === "owner") return true;
  if (!access.assigned) return false;
  switch (role) {
    case "project_manager":
    case "team_lead":
      return true;
    default:
      return access.hasWriteAccess;
  }
}

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
