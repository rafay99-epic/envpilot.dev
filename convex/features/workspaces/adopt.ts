import { v, ConvexError } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { isWorkspace } from "../../lib/projectKind";

/**
 * Adoption: one row survives and is re-parented into the group; identical
 * copies in the other projects are soft-deleted. Nothing is re-encrypted, so
 * every project's next pull returns what it returned before. Callers compare
 * values first (share.ts); this only moves rows.
 */

/**
 * Every duplicated key across the workspace's member projects, with the
 * caller's authorization already enforced.
 *
 * Adoption deletes rows in the member projects and creates one in the
 * workspace, so it demands exactly those rights: delete on each project it
 * touches, create on the workspace.
 */
export const _applyAdoption = internalMutation({
  args: {
    workspaceId: v.id("projects"),
    survivorId: v.id("environmentVariables"),
    duplicateIds: v.array(v.id("environmentVariables")),
    key: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace || !isWorkspace(workspace)) {
      throw new ConvexError("Workspace not found");
    }

    const survivor = await ctx.db.get(args.survivorId);
    if (!survivor || survivor.deletedAt) {
      throw new ConvexError(`"${args.key}" is no longer available to adopt.`);
    }

    const now = Date.now();

    // Duplicates go FIRST. Re-parenting before deleting them would leave the
    // workspace row and the project rows both live for an instant, which is
    // exactly the duplicate pair the resolver refuses to serve.
    for (const duplicateId of args.duplicateIds) {
      const duplicate = await ctx.db.get(duplicateId);
      if (!duplicate || duplicate.deletedAt) continue;
      await ctx.db.patch(duplicateId, { deletedAt: now, updatedAt: now });
    }

    await ctx.db.patch(args.survivorId, {
      projectId: args.workspaceId,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: workspace.organizationId,
      projectId: args.workspaceId,
      userId: survivor.lastModifiedBy,
      action: "workspace.variable_adopted",
      details: JSON.stringify({
        key: args.key,
        workspace: workspace.name,
        duplicatesRemoved: args.duplicateIds.length,
      }),
      createdAt: now,
    });

    return null;
  },
});
