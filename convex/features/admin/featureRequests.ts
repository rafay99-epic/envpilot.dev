import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";

export const listFeatureRequests = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    return await ctx.db
      .query("featureRequests")
      .withIndex("by_vote_count")
      .order("desc")
      .collect();
  },
});

export const updateFeatureRequestStatus = mutation({
  args: {
    id: v.id("featureRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const updateFeatureRequestAdminNotes = mutation({
  args: {
    id: v.id("featureRequests"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.id, { adminNotes: args.adminNotes });
  },
});

export const createFeatureRequest = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    category: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("under_review"),
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("declined")
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const title = args.title.trim();
    const description = args.description.trim();
    if (!title) throw new Error("Title is required");
    if (!description) throw new Error("Description is required");
    if (title.length > 200) throw new Error("Title too long (max 200)");
    if (description.length > 5000)
      throw new Error("Description too long (max 5000)");

    const now = Date.now();
    return await ctx.db.insert("featureRequests", {
      title,
      description,
      // Public board — keep the team label, never the admin's email.
      submitterName: "Envpilot Team",
      status: args.status ?? "planned",
      category: args.category?.trim() || undefined,
      adminNotes: args.adminNotes?.trim() || undefined,
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteFeatureRequest = mutation({
  args: {
    id: v.id("featureRequests"),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    // Delete all associated votes first
    const votes = await ctx.db
      .query("featureVotes")
      .withIndex("by_feature_request", (q) => q.eq("featureRequestId", args.id))
      .collect();

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete the feature request
    await ctx.db.delete(args.id);
  },
});

export const clearAllFeatureRequests = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const allRequests = await ctx.db.query("featureRequests").collect();
    const allVotes = await ctx.db.query("featureVotes").collect();

    for (const vote of allVotes) {
      await ctx.db.delete(vote._id);
    }
    for (const req of allRequests) {
      await ctx.db.delete(req._id);
    }

    return {
      deletedRequests: allRequests.length,
      deletedVotes: allVotes.length,
    };
  },
});
