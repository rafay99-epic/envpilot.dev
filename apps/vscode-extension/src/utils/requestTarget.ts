import { formatRoleLabel, normalizeOrgRole } from "../roles";
import type { Organization, Project } from "../types";

export interface PickerSeparatorRow {
  kind: "separator";
  label: string;
}

export interface PickerProjectRow {
  kind: "project";
  project: Project;
  label: string;
  description: string;
  isCurrent: boolean;
}

export type PickerRow = PickerSeparatorRow | PickerProjectRow;

export function isRequestEligible(project: Project): boolean {
  if (project.assigned === false) return false;
  if (project.capabilities) {
    return project.capabilities["project.requests.submit"] === true;
  }
  return (
    normalizeOrgRole(project.unifiedRole ?? project.userRole) === "developer"
  );
}

function describeProject(project: Project): string {
  const role = formatRoleLabel(project.unifiedRole ?? project.userRole);
  const scope =
    project.environmentScope && project.environmentScope.length > 0
      ? ` · scope: ${project.environmentScope.join(", ")}`
      : "";
  return `${role}${scope}`;
}

export function groupProjectsForPicker(
  projects: Project[],
  orgs: Organization[],
  currentProjectId?: string | null
): PickerRow[] {
  const orgNameById = new Map(orgs.map((o) => [o._id, o.name]));
  const eligible = projects.filter(isRequestEligible);

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
