import { v, ConvexError } from "convex/values";
import { mutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { isWorkspace, WORKSPACE_KIND } from "../../lib/projectKind";
import { createProjectCore } from "../projects/mutations";
import {
  checkCountedLimit,
  countProjectWorkspaces,
  countWorkspaceProjects,
} from "../featureRegistry/gates";
import { findEnvironmentConflicts } from "../variables/helpers";
import { MAX_WORKSPACES_PER_PROJECT } from "../variables/resolve";

/**
 * Workspace membership.
 *
 * Creating a workspace is `createProjectCore` with a kind stamp, and editing
 * its variables is the ordinary project.variables.* check on the workspace
 * row, so neither needs code here. What does need code is the membership
 * edge, because adding a project is the one action that widens who can read a
 * secret: every reader of the project gains read on the workspace's values,
 * without being named on the workspace at all.
 */

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    /**
     * Projects to link on creation. A workspace exists to be shared with, so
     * making it in one step is the normal case, not an extra feature.
     */
    projectIds: v.optional(v.array(v.id("projects"))),
  },
  returns: v.id("projects"),
  handler: async (ctx, args): Promise<Id<"projects">> => {
    const actor = await requireAuthedUser(ctx);
    const { projectIds, ...workspaceArgs } = args;

    const workspaceId = await createProjectCore(ctx, actor, {
      ...workspaceArgs,
      kind: WORKSPACE_KIND,
    });

    for (const projectId of projectIds ?? []) {
      await linkProjectCore(ctx, actor, { workspaceId, projectId });
    }

    return workspaceId;
  },
});

export const addProject = mutation({
  args: {
    workspaceId: v.id("projects"),
    projectId: v.id("projects"),
    environments: v.optional(v.array(v.string())),
  },
  returns: v.id("workspaceProjects"),
  handler: async (ctx, args): Promise<Id<"workspaceProjects">> => {
    const actor = await requireAuthedUser(ctx);
    return linkProjectCore(ctx, actor, args);
  },
});

async function linkProjectCore(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: {
    workspaceId: Id<"projects">;
    projectId: Id<"projects">;
    environments?: string[];
  }
): Promise<Id<"workspaceProjects">> {
  {
    const { workspace, project } = await loadEdge(ctx, args);

    // Both sides are checked. Manage rights on the project being added stop
    // someone granting their own project access to credentials they were
    // never given; read on the workspace stops them mounting one they cannot
    // already see.
    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:manage_workspaces"
    );
    await assertProjectAction(ctx, actor._id, args.workspaceId, "project:read");

    const existing = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace_and_project", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("projectId", args.projectId)
      )
      .first();
    if (existing) {
      throw new ConvexError(
        `"${project.name}" is already in "${workspace.name}".`
      );
    }

    const perWorkspace = await checkCountedLimit(
      ctx.db,
      workspace.organizationId,
      "max_projects_per_workspace",
      () => countWorkspaceProjects(ctx.db, args.workspaceId)
    );
    if (!perWorkspace.allowed) throw new ConvexError(perWorkspace.reason!);

    const perProject = await checkCountedLimit(
      ctx.db,
      workspace.organizationId,
      "max_workspaces_per_project",
      () => countProjectWorkspaces(ctx.db, args.projectId)
    );
    if (!perProject.allowed) throw new ConvexError(perProject.reason!);

    // Every key the workspace would start sharing has to be free in the
    // project, in the environments this membership carries. Strict
    // inheritance: a collision is refused here, never resolved by precedence
    // at read time.
    await assertNoIncomingCollisions(ctx, {
      workspace,
      project,
      environments: args.environments,
    });

    const now = Date.now();
    const membershipId = await ctx.db.insert("workspaceProjects", {
      organizationId: workspace.organizationId,
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      environments: args.environments,
      createdBy: actor._id,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: workspace.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "workspace.project_added",
      details: JSON.stringify({
        workspace: workspace.name,
        project: project.name,
        environments: args.environments ?? "all",
      }),
      createdAt: now,
    });

    return membershipId;
  }
}

export const removeProject = mutation({
  args: {
    workspaceId: v.id("projects"),
    projectId: v.id("projects"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await requireAuthedUser(ctx);
    const { workspace, project } = await loadEdge(ctx, args);

    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:manage_workspaces"
    );

    const membership = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace_and_project", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("projectId", args.projectId)
      )
      .first();
    if (!membership) {
      throw new ConvexError(`"${project.name}" is not in "${workspace.name}".`);
    }

    // Leaving drops the inherited keys. Copying them into the project first,
    // or replacing them with fresh values, is the client-driven flow that
    // runs BEFORE this mutation, because it needs vault writes.
    await ctx.db.delete(membership._id);

    await ctx.db.insert("auditLogs", {
      organizationId: workspace.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "workspace.project_removed",
      details: JSON.stringify({
        workspace: workspace.name,
        project: project.name,
      }),
      createdAt: Date.now(),
    });

    return null;
  },
});

/** Both ends of a membership edge, validated as same-org and right-kind. */
async function loadEdge(
  ctx: { db: { get: (id: Id<"projects">) => Promise<Doc<"projects"> | null> } },
  args: { workspaceId: Id<"projects">; projectId: Id<"projects"> }
): Promise<{ workspace: Doc<"projects">; project: Doc<"projects"> }> {
  const workspace = await ctx.db.get(args.workspaceId);
  if (!workspace || workspace.deletedAt) {
    throw new ConvexError("Workspace not found");
  }
  if (!isWorkspace(workspace)) {
    throw new ConvexError(`"${workspace.name}" is a project, not a workspace.`);
  }

  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new ConvexError("Project not found");
  }
  if (isWorkspace(project)) {
    throw new ConvexError(
      "A workspace cannot belong to another workspace. Inheritance is one level deep."
    );
  }

  // Cross-organization sharing would turn the org boundary into a suggestion.
  if (project.organizationId !== workspace.organizationId) {
    throw new ConvexError(
      "A workspace can only share with projects in the same organization."
    );
  }

  return { workspace, project };
}

/**
 * Refuse the membership if any key the workspace shares is already owned by
 * the project in an overlapping environment. Reported all at once: fixing
 * them one error at a time would be miserable with eight credentials.
 */
async function assertNoIncomingCollisions(
  ctx: Parameters<typeof findEnvironmentConflicts>[0],
  args: {
    workspace: Doc<"projects">;
    project: Doc<"projects">;
    environments: string[] | undefined;
  }
): Promise<void> {
  const shared = await ctx.db
    .query("environmentVariables")
    .withIndex("by_project_deleted", (q) =>
      q.eq("projectId", args.workspace._id).eq("deletedAt", undefined)
    )
    .collect();

  const clashing: string[] = [];

  for (const row of shared) {
    if (row.appliesTo && !row.appliesTo.includes(args.project._id)) continue;

    const carried = args.environments
      ? row.environments.filter((environment) =>
          args.environments?.includes(environment)
        )
      : row.environments;
    if (carried.length === 0) continue;

    const conflicts = await findEnvironmentConflicts(ctx, {
      projectId: args.project._id,
      key: row.key,
      environments: carried,
    });
    if (conflicts.length > 0) {
      clashing.push(`${row.key} (${carried.join(", ")})`);
    }
  }

  if (clashing.length > 0) {
    throw new ConvexError(
      `"${args.project.name}" already defines ${clashing.join(", ")}. Delete its own copy to inherit the workspace value, or leave it out of this workspace.`
    );
  }
}

export { MAX_WORKSPACES_PER_PROJECT };

/**
 * Narrow one shared variable to a subset of the workspace's projects, or hand
 * it back to all of them.
 *
 * `projectIds` absent means every member project, and it keeps following
 * membership as projects join. A list means exactly those, so a project that
 * joins later does NOT receive it.
 *
 * Widening is the direction that can break: a project newly brought into
 * scope may already own the key, and strict inheritance has no precedence to
 * fall back on. Every newly-included project is checked before anything is
 * written.
 */
export const setVariableScope = mutation({
  args: {
    workspaceId: v.id("projects"),
    variableId: v.id("environmentVariables"),
    projectIds: v.optional(v.array(v.id("projects"))),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await requireAuthedUser(ctx);

    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || workspace.deletedAt || !isWorkspace(workspace)) {
      throw new ConvexError("Workspace not found");
    }

    await assertProjectAction(
      ctx,
      actor._id,
      args.workspaceId,
      "project:update_variable"
    );

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new ConvexError("Variable not found");
    }
    if (variable.projectId !== args.workspaceId) {
      throw new ConvexError("That variable does not belong to this workspace.");
    }

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const memberIds = new Set(
      memberships.map((row) => row.projectId as string)
    );

    for (const projectId of args.projectIds ?? []) {
      if (!memberIds.has(projectId as string)) {
        throw new ConvexError(
          "Only projects already linked to this workspace can be selected."
        );
      }
    }

    // Which projects gain the key as a result of this change.
    const wasScoped = variable.appliesTo;
    const nowScoped = args.projectIds;
    const reaches = (scope: Id<"projects">[] | undefined, id: Id<"projects">) =>
      !scope || scope.includes(id);

    for (const membership of memberships) {
      const gaining =
        !reaches(wasScoped, membership.projectId) &&
        reaches(nowScoped, membership.projectId);
      if (!gaining) continue;

      const carried = membership.environments
        ? variable.environments.filter((environment) =>
            membership.environments?.includes(environment)
          )
        : variable.environments;
      if (carried.length === 0) continue;

      const conflicts = await findEnvironmentConflicts(ctx, {
        projectId: membership.projectId,
        key: variable.key,
        environments: carried,
      });
      if (conflicts.length > 0) {
        const project = await ctx.db.get(membership.projectId);
        throw new ConvexError(
          `"${project?.name ?? "A project"}" already defines ${variable.key}. Delete its own copy first, or leave it out of this variable's scope.`
        );
      }
    }

    await ctx.db.patch(args.variableId, {
      appliesTo: args.projectIds,
      updatedAt: Date.now(),
    });

    return null;
  },
});
