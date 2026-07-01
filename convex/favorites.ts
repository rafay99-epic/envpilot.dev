import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createAuditLog } from "./auditHelpers";

/**
 * Favorite Projects — user-specific project bookmarking
 */

export const listByUser = query({
  args: {
    userId: v.id("users"),
  },
  returns: v.array(
    v.object({
      _id: v.id("favoriteProjects"),
      _creationTime: v.number(),
      userId: v.id("users"),
      projectId: v.id("projects"),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const favorites = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return favorites;
  },
});

export const isFavorite = query({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const favorite = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", args.userId).eq("projectId", args.projectId)
      )
      .first();

    return !!favorite;
  },
});

export const toggle = mutation({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
  },
  returns: v.object({ favorited: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", args.userId).eq("projectId", args.projectId)
      )
      .first();

    const project = await ctx.db.get(args.projectId);

    if (existing) {
      await ctx.db.delete(existing._id);

      if (project) {
        await createAuditLog(ctx, {
          organizationId: project.organizationId,
          projectId: args.projectId,
          userId: args.userId,
          action: "project.unfavorited",
          details: { projectName: project.name },
        });
      }

      return { favorited: false };
    }

    await ctx.db.insert("favoriteProjects", {
      userId: args.userId,
      projectId: args.projectId,
      createdAt: Date.now(),
    });

    if (project) {
      await createAuditLog(ctx, {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: args.userId,
        action: "project.favorited",
        details: { projectName: project.name },
      });
    }

    return { favorited: true };
  },
});
