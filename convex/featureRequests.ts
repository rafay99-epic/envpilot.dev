import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Feature Requests (Wishlist) Queries and Mutations
 * Public-facing feature voting system
 */

// Constants for validation
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

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

    // Sort by vote count descending
    return filteredRequests.sort((a, b) => b.voteCount - a.voteCount);
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
 * Get vote count for a feature request
 */
export const getVoteCount = query({
  args: { featureRequestId: v.id("featureRequests") },
  handler: async (ctx, args) => {
    const feature = await ctx.db.get(args.featureRequestId);
    return feature?.voteCount ?? 0;
  },
});

/**
 * Check if a user/email has voted for a feature
 */
export const hasVoted = query({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.userId) {
      const vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
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

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Submit a new feature request
 */
export const submit = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    submitterEmail: v.optional(v.string()),
    submitterName: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const title = args.title.trim();
    const description = args.description.trim();
    const email = args.submitterEmail?.trim();
    const name = args.submitterName?.trim();
    const category = args.category?.trim();

    // Validate required fields
    if (!title) {
      throw new Error("Title is required");
    }

    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }

    if (!description) {
      throw new Error("Description is required");
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Validate category length if provided
    if (category && category.length > MAX_CATEGORY_LENGTH) {
      throw new Error(
        `Category must be ${MAX_CATEGORY_LENGTH} characters or less`
      );
    }

    // Create the feature request
    const featureRequestId = await ctx.db.insert("featureRequests", {
      title,
      description,
      submitterEmail: email,
      submitterName: name,
      userId: args.userId,
      status: "submitted",
      category,
      voteCount: 1, // Auto-vote for submitter
      createdAt: now,
      updatedAt: now,
    });

    // Create initial vote from submitter
    if (args.userId || email) {
      await ctx.db.insert("featureVotes", {
        featureRequestId,
        userId: args.userId,
        voterEmail: email,
        createdAt: now,
      });
    }

    return featureRequestId;
  },
});

/**
 * Vote for a feature request
 */
export const vote = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.voterEmail?.trim();

    // Validate that we have some form of voter identification
    if (!args.userId && !email) {
      throw new Error("User ID or email required to vote");
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Check if feature request exists
    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    // If user is logged in, check by userId only (prevent double-identity voting)
    if (args.userId) {
      const existingVote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
        )
        .first();

      if (existingVote) {
        throw new Error("You have already voted for this feature");
      }

      // Create vote with userId only (don't store email for logged-in users)
      await ctx.db.insert("featureVotes", {
        featureRequestId: args.featureRequestId,
        userId: args.userId,
        ipHash: args.ipHash,
        createdAt: now,
      });
    } else if (email) {
      // Anonymous voting - check by email
      const existingVote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", email)
        )
        .first();

      if (existingVote) {
        throw new Error("This email has already voted for this feature");
      }

      // Create vote with email
      await ctx.db.insert("featureVotes", {
        featureRequestId: args.featureRequestId,
        voterEmail: email,
        ipHash: args.ipHash,
        createdAt: now,
      });
    }

    // Update vote count on feature request
    await ctx.db.patch(args.featureRequestId, {
      voteCount: feature.voteCount + 1,
      updatedAt: now,
    });

    return { success: true, newVoteCount: feature.voteCount + 1 };
  },
});

/**
 * Remove vote from a feature request
 */
export const unvote = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if feature request exists
    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    let vote = null;

    // Find vote by user ID
    if (args.userId) {
      vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
        )
        .first();
    }

    // Find vote by email if not found by user ID
    if (!vote && args.voterEmail) {
      vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", args.voterEmail!)
        )
        .first();
    }

    if (!vote) {
      throw new Error("Vote not found");
    }

    // Delete the vote
    await ctx.db.delete(vote._id);

    // Update vote count on feature request
    const newVoteCount = Math.max(0, feature.voteCount - 1);
    await ctx.db.patch(args.featureRequestId, {
      voteCount: newVoteCount,
      updatedAt: now,
    });

    return { success: true, newVoteCount };
  },
});

/**
 * Update feature request status (admin only)
 * Requires authenticated user with admin privileges
 */
export const updateStatus = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    adminNotes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is admin (has admin membership in any organization)
    const adminMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();

    if (!adminMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    await ctx.db.patch(args.featureRequestId, {
      status: args.status,
      adminNotes: args.adminNotes,
      updatedAt: now,
    });

    return args.featureRequestId;
  },
});

/**
 * Update feature request details (admin only)
 * Requires authenticated user with admin privileges
 */
export const update = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { featureRequestId, userId, ...updates } = args;

    // Verify user exists
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is admin (has admin membership in any organization)
    const adminMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();

    if (!adminMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };

    // Validate and set title
    if (updates.title !== undefined) {
      const title = updates.title.trim();
      if (title.length > MAX_TITLE_LENGTH) {
        throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
      }
      updateData.title = title;
    }

    // Validate and set description
    if (updates.description !== undefined) {
      const description = updates.description.trim();
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(
          `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
        );
      }
      updateData.description = description;
    }

    // Validate and set category
    if (updates.category !== undefined) {
      const category = updates.category.trim();
      if (category.length > MAX_CATEGORY_LENGTH) {
        throw new Error(
          `Category must be ${MAX_CATEGORY_LENGTH} characters or less`
        );
      }
      updateData.category = category;
    }

    if (updates.adminNotes !== undefined) {
      updateData.adminNotes = updates.adminNotes;
    }

    await ctx.db.patch(featureRequestId, updateData);

    return featureRequestId;
  },
});

/**
 * Delete a feature request (admin only)
 * Requires authenticated user with admin privileges
 */
export const remove = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is admin (has admin membership in any organization)
    const adminMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .first();

    if (!adminMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    // Delete all votes for this feature
    const votes = await ctx.db
      .query("featureVotes")
      .withIndex("by_feature_request", (q) =>
        q.eq("featureRequestId", args.featureRequestId)
      )
      .collect();

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete the feature request
    await ctx.db.delete(args.featureRequestId);

    return { success: true };
  },
});
