import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { createAuditLog } from "../../auditHelpers";
import { requireAuthedUser } from "../../identity";

/**
 * Favorite Projects — user-specific project bookmarking
 */

export const listByUser = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("favoriteProjects"),
      _creationTime: v.number(),
      userId: v.id("users"),
      projectId: v.id("projects"),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);

    const favorites = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    return favorites;
  },
});

export const toggle = mutation({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.object({ favorited: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const existing = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", actor._id).eq("projectId", args.projectId)
      )
      .first();

    const project = await ctx.db.get(args.projectId);

    if (existing) {
      await ctx.db.delete(existing._id);

      if (project) {
        await createAuditLog(ctx, {
          organizationId: project.organizationId,
          projectId: args.projectId,
          userId: actor._id,
          action: "project.unfavorited",
          details: { projectName: project.name },
        });
      }

      return { favorited: false };
    }

    await ctx.db.insert("favoriteProjects", {
      userId: actor._id,
      projectId: args.projectId,
      createdAt: Date.now(),
    });

    if (project) {
      await createAuditLog(ctx, {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: actor._id,
        action: "project.favorited",
        details: { projectName: project.name },
      });
    }

    return { favorited: true };
  },
});
