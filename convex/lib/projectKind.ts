import type { DatabaseReader } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * A WORKSPACE is a project row that owns variables several projects share.
 *
 * THE single definition of that distinction. A workspace must never appear in
 * a project listing, a project count, or a client pull, and the way to keep
 * that true as new listings are written is for every one of them to come
 * through here rather than re-deriving `kind === "workspace"` by hand.
 *
 * Adding a second kind later is a change to this file plus the schema union;
 * nothing else re-derives it. Same shape as lib/surfaces.ts.
 */

export const WORKSPACE_KIND = "workspace";

/** A project row that holds shared variables rather than a real project. */
export function isWorkspace(project: Doc<"projects">): boolean {
  return project.kind === WORKSPACE_KIND;
}

/**
 * Indexed range over an organization's real projects: active, and never a
 * workspace. Returns the query builder so callers keep their own
 * `.collect()` / `.take()` / `.paginate()` and their own read bounds.
 *
 * `kind` sits before `deletedAt` in the index so `eq("kind", undefined)`
 * prunes workspaces in the index rather than in memory.
 */
export function activeProjectsQuery(
  db: DatabaseReader,
  organizationId: Id<"organizations">
) {
  return db
    .query("projects")
    .withIndex("by_org_kind_deleted", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("kind", undefined)
        .eq("deletedAt", undefined)
    );
}

/** Indexed range over an organization's active workspaces. */
export function activeWorkspacesQuery(
  db: DatabaseReader,
  organizationId: Id<"organizations">
) {
  return db
    .query("projects")
    .withIndex("by_org_kind_deleted", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("kind", WORKSPACE_KIND)
        .eq("deletedAt", undefined)
    );
}

/**
 * The member projects a workspace row reaches: every linked project, or the
 * `appliesTo` subset when the variable names one. Authorization on a shared
 * row is decided against these, never against the workspace row itself.
 */
export async function reachedProjects(
  db: DatabaseReader,
  workspaceId: Id<"projects">,
  appliesTo?: readonly Id<"projects">[]
): Promise<Doc<"projects">[]> {
  const memberships = await db
    .query("workspaceProjects")
    .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    .collect();
  const projects: Doc<"projects">[] = [];
  for (const membership of memberships) {
    if (appliesTo && !appliesTo.includes(membership.projectId)) continue;
    const project = await db.get(membership.projectId);
    if (
      project &&
      !project.deletedAt &&
      project.organizationId === membership.organizationId
    ) {
      projects.push(project);
    }
  }
  return projects;
}
