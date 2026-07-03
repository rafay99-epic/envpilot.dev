// Pure helpers for the "Request Variable" project picker. No `vscode` import —
// the caller maps the returned rows onto QuickPickItems — so this stays
// hermetically testable under plain Node (see requestTarget.test.ts).

import { formatRoleLabel, normalizeOrgRole } from "../roles";
import type { Organization, Project } from "../types";

/** Separator row carrying an organization name (heads each org group). */
export interface PickerSeparatorRow {
  kind: "separator";
  /** Organization display name, or the raw id when the name is unknown. */
  label: string;
}

/** A selectable project row targeting one request-eligible project. */
export interface PickerProjectRow {
  kind: "project";
  /** The eligible project this row submits a request against. */
  project: Project;
  /** Project name, prefixed with a check glyph when it is the current one. */
  label: string;
  /** Role label plus an optional environment-scope hint. */
  description: string;
  /** True for the workspace's currently linked project. */
  isCurrent: boolean;
}

export type PickerRow = PickerSeparatorRow | PickerProjectRow;

/**
 * Whether a project is a valid target for a variable request. Requests are the
 * developer path — owners, project managers, and team leads write directly —
 * and a grant-only project the user is not assigned to can never be requested
 * against. `assigned` is treated as eligible unless it is explicitly `false`,
 * so a legacy server that omits the field does not silently hide projects.
 */
export function isRequestEligible(project: Project): boolean {
  const role = normalizeOrgRole(project.unifiedRole ?? project.userRole);
  return role === "developer" && project.assigned !== false;
}

/** Role label plus, for scoped developers, the accessible environments. */
function describeProject(project: Project): string {
  const role = formatRoleLabel(project.unifiedRole ?? project.userRole);
  const scope =
    project.environmentScope && project.environmentScope.length > 0
      ? ` · scope: ${project.environmentScope.join(", ")}`
      : "";
  return `${role}${scope}`;
}

/**
 * Build the grouped rows for the "Request Variable" project picker.
 *
 * Only request-eligible projects (see {@link isRequestEligible}) are included.
 * Rows are grouped by organization — a separator row precedes each group — with
 * organizations kept in the order first encountered. Within a group the
 * workspace's currently linked project leads and is flagged (`isCurrent`) so the
 * caller can surface it as the natural default; the remaining projects keep
 * their received order. Returns plain data so it can be unit-tested without the
 * VS Code host.
 */
export function groupProjectsForPicker(
  projects: Project[],
  orgs: Organization[],
  currentProjectId?: string | null
): PickerRow[] {
  const orgNameById = new Map(orgs.map((o) => [o._id, o.name]));
  const eligible = projects.filter(isRequestEligible);

  // Bucket eligible projects per organization, preserving encounter order.
  const orgOrder: string[] = [];
  const byOrg = new Map<string, Project[]>();
  for (const project of eligible) {
    const bucket = byOrg.get(project.organizationId);
    if (bucket) {
      bucket.push(project);
    } else {
      byOrg.set(project.organizationId, [project]);
      orgOrder.push(project.organizationId);
    }
  }

  const rows: PickerRow[] = [];
  for (const orgId of orgOrder) {
    const group = byOrg.get(orgId)!;
    // Current project first (if present in this group); rest keep their order.
    const ordered = [
      ...group.filter((p) => p._id === currentProjectId),
      ...group.filter((p) => p._id !== currentProjectId),
    ];
    rows.push({ kind: "separator", label: orgNameById.get(orgId) ?? orgId });
    for (const project of ordered) {
      const isCurrent = project._id === currentProjectId;
      rows.push({
        kind: "project",
        project,
        label: isCurrent ? `$(check) ${project.name}` : project.name,
        description: describeProject(project),
        isCurrent,
      });
    }
  }
  return rows;
}
