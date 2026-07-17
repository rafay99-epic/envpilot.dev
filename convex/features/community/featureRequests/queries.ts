import { v } from "convex/values";
import { query } from "../../../_generated/server";
import { getAuthedUser } from "../../../lib/identity";

/**
 * Feature Requests (Wishlist) Queries
 * Public-facing feature voting system
 */

// ==========================================
// QUERIES
// ==========================================

/**
 * List all public feature requests (sorted by vote count)
 */
export const listPublic = query({
  args: {
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
    category: v.optional(v.string()),
    sort: v.optional(v.union(v.literal("top"), v.literal("new"))),
  },
  handler: async (ctx, args) => {
    let requests;

    // Apply status filter if provided
    if (args.status) {
      requests = await ctx.db
        .query("featureRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      requests = await ctx.db.query("featureRequests").collect();
    }

    // Filter by category if provided (post-query filtering since we can only use one index)
    let filteredRequests = requests;
    if (args.category) {
      filteredRequests = requests.filter((r) => r.category === args.category);
    }

    // "top" (default): most-voted first; "new": most recent first
    return args.sort === "new"
      ? filteredRequests.sort((a, b) => b.createdAt - a.createdAt)
      : filteredRequests.sort((a, b) => b.voteCount - a.voteCount);
  },
});

/**
 * Get a single feature request by ID
 */
export const getById = query({
  args: { featureRequestId: v.id("featureRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.featureRequestId);
  },
});

/**
 * Get all feature requests with planned/in_progress status (for roadmap view)
 */
export const listPlanned = query({
  args: {},
  handler: async (ctx) => {
    const planned = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "planned"))
      .collect();

    const inProgress = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const completed = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    return {
      planned: planned.sort((a, b) => b.voteCount - a.voteCount),
      inProgress: inProgress.sort((a, b) => b.voteCount - a.voteCount),
      completed: completed
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10), // Show last 10 completed
    };
  },
});

/**
 * Check if a user/email has voted for a feature
 */
export const hasVoted = query({
  args: {
    featureRequestId: v.id("featureRequests"),
    voterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Anonymous-capable: derive the actor from the verified identity when
    // signed in; otherwise fall back to the anonymous email path.
    const actor = await getAuthedUser(ctx);

    if (actor) {
      const vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", actor._id)
        )
        .first();
      return !!vote;
    }

    if (args.voterEmail) {
      const vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", args.voterEmail!)
        )
        .first();
      return !!vote;
    }

    return false;
  },
});

/**
 * Get all unique categories
 */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db.query("featureRequests").collect();
    const categories = new Set<string>();

    for (const request of requests) {
      if (request.category) {
        categories.add(request.category);
      }
    }

    return Array.from(categories).sort();
  },
});
