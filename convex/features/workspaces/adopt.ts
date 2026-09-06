import { v, ConvexError } from "convex/values";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { isWorkspace } from "../../lib/projectKind";
import { assertProtectedWrite } from "../../lib/protection";
import { revokeSharesForResource } from "../sharing/helpers";

/**
 * Adoption: one row survives and is re-parented into the group; identical
 * copies in the other projects are soft-deleted. Nothing is re-encrypted, so
 * every project's next pull returns what it returned before. Callers compare
 * values first (share.ts, merge.ts); this only moves rows, and it is a
 * protected write like any other when the group reaches a protected
 * environment.
 */
export async function applyAdoptionCore(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"projects">;
    survivorId: Id<"environmentVariables">;
    duplicateIds: Id<"environmentVariables">[];
    key: string;
    /** Set when the group already has members the caller did not pick. */
    appliesTo?: Id<"projects">[];
    actorId: Id<"users">;
    viaRequestId?: Id<"changeRequests">;
    override?: boolean;
  }
): Promise<null> {
  const workspace = await ctx.db.get(args.workspaceId);
  if (!workspace || workspace.deletedAt || !isWorkspace(workspace)) {
    throw new ConvexError("Workspace not found");
  }
  const survivor = await ctx.db.get(args.survivorId);
  if (!survivor || survivor.deletedAt || survivor.key !== args.key) {
    throw new ConvexError(`"${args.key}" is no longer available to adopt.`);
  }
  await assertProjectAction(
    ctx,
    args.actorId,
    survivor.projectId,
    "project:manage_workspaces"
  );
  await assertProtectedWrite(ctx, {
    project: workspace,
    envs: survivor.environments,
    actorId: args.actorId,
    resourceType: "variable",
    targetId: args.survivorId,
    viaRequestId: args.viaRequestId,
    override: args.override,
  });

  const now = Date.now();
  // Duplicates go FIRST. Re-parenting before deleting them would leave the
  // workspace row and the project rows both live for an instant, which is
  // exactly the duplicate pair the resolver refuses to serve. Each one is
  // re-checked here: the verdict came from an action a moment ago.
  for (const duplicateId of args.duplicateIds) {
    const duplicate = await ctx.db.get(duplicateId);
    if (!duplicate || duplicate.deletedAt) continue;
    if (duplicate.key !== args.key) {
      throw new ConvexError(`"${args.key}" changed while sharing. Try again.`);
    }
    await assertProjectAction(
      ctx,
      args.actorId,
      duplicate.projectId,
      "project:delete_variable"
    );
    await revokeSharesForResource(ctx, {
      resourceType: "variable",
      variableId: duplicateId,
      actorId: args.actorId,
    });
    await ctx.db.patch(duplicateId, { deletedAt: now, updatedAt: now });
  }

  await ctx.db.patch(args.survivorId, {
    projectId: args.workspaceId,
    appliesTo: args.appliesTo,
    updatedAt: now,
  });

  await ctx.db.insert("auditLogs", {
    organizationId: workspace.organizationId,
    projectId: args.workspaceId,
    userId: args.actorId,
    action: "workspace.variable_adopted",
    details: JSON.stringify({
      key: args.key,
      workspace: workspace.name,
      duplicatesRemoved: args.duplicateIds.length,
      viaRequestId: args.viaRequestId,
    }),
    createdAt: now,
  });
  return null;
}

export const _applyAdoption = internalMutation({
  args: {
    workspaceId: v.id("projects"),
    survivorId: v.id("environmentVariables"),
    duplicateIds: v.array(v.id("environmentVariables")),
    key: v.string(),
    appliesTo: v.optional(v.array(v.id("projects"))),
    override: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const actor = await requireAuthedUser(ctx);
    return applyAdoptionCore(ctx, { ...args, actorId: actor._id });
  },
});
