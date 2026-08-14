import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { createAuditLog } from "../../lib/audit";
import { requireAuthedUser } from "../../lib/identity";

/**
 * Favorite Projects — user-specific project bookmarking
 */

/**
 * Favorited project ids for the caller. Only the ids are returned — callers
 * use this as a membership set, and shipping the full rows made every
 * favorite toggle push four unused fields per favorite over the socket.
 */
export const listByUser = query({
  args: {},
  returns: v.array(v.id("projects")),
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);

    const favorites = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    return favorites.map((favorite) => favorite.projectId);
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
