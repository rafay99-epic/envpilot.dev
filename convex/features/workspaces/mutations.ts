import { v, ConvexError } from "convex/values";
import { mutation, type MutationCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { isWorkspace } from "../../lib/projectKind";
import {
  checkCountedLimit,
  countProjectWorkspaces,
  countWorkspaceProjects,
} from "../featureRegistry/gates";
import { findEnvironmentConflicts } from "../variables/helpers";
import { syncWorkspaceProtection } from "../../lib/protection";
import { MAX_WORKSPACES_PER_PROJECT } from "../variables/resolve";

/**
 * Group membership. Adding a project is the one action that widens who can
 * read a secret, so both ends are checked. share.ts and unshare drive these.
 */

export async function linkProjectCore(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: { workspaceId: Id<"projects">; projectId: Id<"projects"> }
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

    // Every key the workspace shares has to be free in the project. Strict
    // inheritance: a collision is refused here, never resolved by precedence
    // at read time.
    await assertNoIncomingCollisions(ctx, { workspace, project });

    const now = Date.now();
    const membershipId = await ctx.db.insert("workspaceProjects", {
      organizationId: workspace.organizationId,
      workspaceId: args.workspaceId,
      projectId: args.projectId,
      createdBy: actor._id,
      createdAt: now,
    });
    await syncWorkspaceProtection(ctx, args.workspaceId, actor._id);
    // Moves the member's IDE change signal.
    await ctx.db.patch(args.projectId, { updatedAt: now });

    await ctx.db.insert("auditLogs", {
      organizationId: workspace.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "workspace.project_added",
      details: JSON.stringify({
        workspace: workspace.name,
        project: project.name,
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

    // Copying values into the project first happens in unshare.ts, which
    // needs vault reads and calls this mutation last.
    await ctx.db.delete(membership._id);
    await syncWorkspaceProtection(ctx, args.workspaceId, actor._id);
    await ctx.db.patch(args.projectId, { updatedAt: Date.now() });

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
  args: { workspace: Doc<"projects">; project: Doc<"projects"> }
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

    const conflicts = await findEnvironmentConflicts(ctx, {
      projectId: args.project._id,
      key: row.key,
      environments: row.environments,
    });
    if (conflicts.length > 0) {
      clashing.push(`${row.key} (${row.environments.join(", ")})`);
    }
  }

  if (clashing.length > 0) {
    throw new ConvexError(
      `"${args.project.name}" already defines ${clashing.join(", ")}. Delete its own copy to inherit the workspace value, or leave it out of this workspace.`
    );
  }
}

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

      const conflicts = await findEnvironmentConflicts(ctx, {
        projectId: membership.projectId,
        key: variable.key,
        environments: variable.environments,
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
