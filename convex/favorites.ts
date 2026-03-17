import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Favorite Projects — user-specific project bookmarking
 */

export const listByUser = query({
  args: {
    userId: v.id("users"),
  },
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
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user_and_project", (q) =>
        q.eq("userId", args.userId).eq("projectId", args.projectId)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { favorited: false };
    }

    await ctx.db.insert("favoriteProjects", {
      userId: args.userId,
      projectId: args.projectId,
      createdAt: Date.now(),
    });

    return { favorited: true };
  },
});
