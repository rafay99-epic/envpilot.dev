import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { verifyAdmin } from "./auth";

export const listFeatureRequests = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("featureRequests")
      .withIndex("by_vote_count")
      .order("desc")
      .collect();
  },
});

export const updateFeatureRequestStatus = mutation({
  args: {
    secret: v.string(),
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
    verifyAdmin(args.secret);
    const feature = await ctx.db.get(args.id);
    if (!feature) return;
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    // Notify the submitter on meaningful transitions. Fire-and-forget via the
    // scheduler — a send failure must never block or roll back the update.
    if (
      feature.submitterEmail &&
      feature.status !== args.status &&
      (args.status === "planned" ||
        args.status === "in_progress" ||
        args.status === "completed")
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.emails.emails.sendFeatureRequestStatusEmail,
        {
          to: feature.submitterEmail,
          submitterName: feature.submitterName,
          title: feature.title,
          status: args.status,
        }
      );
    }
  },
});

export const updateFeatureRequestAdminNotes = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { adminNotes: args.adminNotes });
  },
});

export const createFeatureRequest = mutation({
  args: {
    secret: v.string(),
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
    verifyAdmin(args.secret);

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
    secret: v.string(),
    id: v.id("featureRequests"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

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
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

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
