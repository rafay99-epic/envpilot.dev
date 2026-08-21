import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  getActiveMembership,
  getRoleProfile,
  bypassesAssignment,
} from "../../lib/authz";
import { activeWorkspacesQuery, isWorkspace } from "../../lib/projectKind";
import { resolveEffectiveVariables } from "../variables/resolve";
import { resolveProjectAccessContext } from "../variables/helpers";
import { isEnvironmentScopeAllowed } from "../../lib/authz";

/**
 * Workspace reads.
 *
 * Visibility mirrors projects exactly, because a workspace IS a project row:
 * roles that bypass assignment see every workspace in the org, everyone else
 * sees the ones they are assigned to. Reading a workspace's page is a
 * different question from reading the values it shares — that second one is
 * answered by project membership, in resolve.ts, and needs nothing here.
 */

type WorkspaceSummary = {
  _id: Id<"projects">;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  variableCount: number;
  projectCount: number;
  updatedAt: number;
};

async function visibleWorkspaces(
  ctx: Parameters<typeof getActiveMembership>[0],
  organizationId: Id<"organizations">,
  userId: Id<"users">
): Promise<Doc<"projects">[]> {
  const membership = await getActiveMembership(ctx, organizationId, userId);
  if (!membership) return [];

  const profile = await getRoleProfile(ctx, membership.role);
  const all = await activeWorkspacesQuery(ctx.db, organizationId).collect();
  if (bypassesAssignment(profile)) return all;

  const assignments = await ctx.db
    .query("projectMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const assigned = new Set(assignments.map((row) => row.projectId as string));

  // Assignment-scoped roles also see any workspace one of their projects
  // reads from — hiding the page while the values already show up on the
  // project's variables list made the feature contradict itself.
  const readable = new Set(assigned);
  for (const row of assignments) {
    const edges = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", row.projectId))
      .collect();
    for (const edge of edges) readable.add(edge.workspaceId as string);
  }

  return all.filter((workspace) => readable.has(workspace._id as string));
}

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args): Promise<WorkspaceSummary[]> => {
    const actor = await requireAuthedUser(ctx);
    const workspaces = await visibleWorkspaces(
      ctx,
      args.organizationId,
      actor._id
    );

    return await Promise.all(
      workspaces.map(async (workspace) => {
        const [variables, memberships] = await Promise.all([
          ctx.db
            .query("environmentVariables")
            .withIndex("by_project_deleted", (q) =>
              q.eq("projectId", workspace._id).eq("deletedAt", undefined)
            )
            .collect(),
          ctx.db
            .query("workspaceProjects")
            .withIndex("by_workspace", (q) =>
              q.eq("workspaceId", workspace._id)
            )
            .collect(),
        ]);

        return {
          _id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          icon: workspace.icon,
          color: workspace.color,
          variableCount: variables.length,
          projectCount: memberships.length,
          updatedAt: workspace.updatedAt,
        };
      })
    );
  },
});

/**
 * A workspace with its member projects, each annotated with what it actually
 * inherits. The per-project count is what makes `appliesTo` legible: a
 * workspace of eight variables where one project inherits four is a fact the
 * page has to state, not something the reader should have to work out.
 */
export const getBySlug = query({
  args: {
    organizationId: v.id("organizations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const workspace = await ctx.db
      .query("projects")
      .withIndex("by_org_slug_deleted", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("slug", args.slug)
          .eq("deletedAt", undefined)
      )
      .first();

    if (!workspace || !isWorkspace(workspace)) return null;

    const visible = await visibleWorkspaces(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!visible.some((row) => row._id === workspace._id)) return null;

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", workspace._id).eq("deletedAt", undefined)
      )
      .collect();

    const projects = await Promise.all(
      memberships.map(async (membership) => {
        const project = await ctx.db.get(membership.projectId);
        const inherits = variables.filter((variable) => {
          if (
            variable.appliesTo &&
            !variable.appliesTo.includes(membership.projectId)
          ) {
            return false;
          }
          if (!membership.environments) return true;
          return variable.environments.some((environment) =>
            membership.environments?.includes(environment)
          );
        }).length;

        return {
          membershipId: membership._id,
          projectId: membership.projectId,
          name: project?.name ?? "Deleted project",
          slug: project?.slug ?? "",
          environments: membership.environments,
          inheritedCount: inherits,
        };
      })
    );

    return {
      workspace,
      projects,
      variables: variables.map((variable) => ({
        _id: variable._id,
        key: variable.key,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        updatedAt: variable.updatedAt,
        // undefined = every member project, and it keeps following
        // membership. A list = the fixed subset this row is scoped to.
        appliesTo: variable.appliesTo,
        appliesToCount: variable.appliesTo?.length,
      })),
      memberCount: memberships.length,
    };
  },
});

/** The workspaces one project belongs to, for its settings panel. */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    const membership = await getActiveMembership(
      ctx,
      project.organizationId,
      actor._id
    );
    if (!membership) return [];

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const rows = await Promise.all(
      memberships.map(async (row) => {
        const workspace = await ctx.db.get(row.workspaceId);
        if (!workspace || workspace.deletedAt) return null;
        return {
          membershipId: row._id,
          workspaceId: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          environments: row.environments,
        };
      })
    );

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  },
});

/**
 * The rows a project inherits, for the "from <workspace>" section of its
 * variables page.
 *
 * Deliberately separate from listWithAccessPaginated rather than folded into
 * it: inherited rows live in a different index range, so merging them would
 * mean rebuilding that query's cursor semantics for no user-visible gain.
 * The page renders them as their own group, which is what the design calls
 * for anyway.
 *
 * Access: project read plus the caller's own environment scope. vaultRef
 * rides along so the row can reveal exactly like an owned one — that access
 * IS the feature, and it is granted by project membership, never by being
 * named on the workspace.
 */
export const listInheritedForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const resolved = await resolveProjectAccessContext(
      ctx,
      args.projectId,
      actor._id
    );
    if (!resolved) return [];

    const { access } = resolved;
    const rows = await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
    });

    return rows
      .filter((row) => row.source.kind === "workspace")
      .filter((row) =>
        isEnvironmentScopeAllowed(access.environmentScope, row.environments)
      )
      .map((row) => ({
        _id: row._id,
        key: row.key,
        environments: row.environments,
        isSensitive: row.isSensitive,
        updatedAt: row.updatedAt,
        vaultRef: row.vaultRef,
        description: row.description,
        workspace:
          row.source.kind === "workspace"
            ? { id: row.source.workspaceId, name: row.source.name }
            : null,
      }));
  },
});
