import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Changelog Queries and Mutations
 * Public queries for viewing changelog entries
 */

// ==========================================
// QUERIES
// ==========================================

/**
 * List all published changelog entries (public)
 * Sorted by publishedAt in descending order (newest first)
 */
export const listPublished = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .order("desc")
      .take(limit);

    // Sort by publishedAt descending
    return entries.sort((a, b) => {
      const aTime = a.publishedAt ?? a.createdAt;
      const bTime = b.publishedAt ?? b.createdAt;
      return bTime - aTime;
    });
  },
});

/**
 * Get a single changelog entry by ID (public if published)
 */
export const getById = query({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.id);

    // Only return if published
    if (!entry || !entry.isPublished) {
      return null;
    }

    return entry;
  },
});

/**
 * Get a changelog entry by version (public if published)
 */
export const getByVersion = query({
  args: { version: v.string() },
  handler: async (ctx, args) => {
    const entry = await ctx.db
      .query("changelog")
      .withIndex("by_version", (q) => q.eq("version", args.version))
      .first();

    // Only return if published
    if (!entry || !entry.isPublished) {
      return null;
    }

    return entry;
  },
});

/**
 * List changelog entries filtered by type (public)
 */
export const listByType = query({
  args: {
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_type", (q) => q.eq("type", args.type))
      .order("desc")
      .take(limit * 2); // Fetch more to filter

    // Filter to only published entries
    const published = entries.filter((e) => e.isPublished);

    // Sort by publishedAt descending and limit
    return published
      .sort((a, b) => {
        const aTime = a.publishedAt ?? a.createdAt;
        const bTime = b.publishedAt ?? b.createdAt;
        return bTime - aTime;
      })
      .slice(0, limit);
  },
});

/**
 * Get all unique versions (public)
 */
export const listVersions = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .collect();

    // Extract unique versions sorted by publishedAt
    const versionMap = new Map<string, number>();
    for (const entry of entries) {
      const time = entry.publishedAt ?? entry.createdAt;
      const existing = versionMap.get(entry.version);
      if (!existing || time > existing) {
        versionMap.set(entry.version, time);
      }
    }

    // Sort versions by their most recent publishedAt
    return Array.from(versionMap.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([version]) => version);
  },
});

// ==========================================
// ADMIN MUTATIONS (for future admin panel)
// ==========================================

/**
 * Create a new changelog entry
 */
export const create = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    version: v.string(),
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const isPublished = args.isPublished ?? false;

    const entryId = await ctx.db.insert("changelog", {
      title: args.title,
      content: args.content,
      version: args.version,
      type: args.type,
      isPublished,
      publishedAt: isPublished ? now : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return entryId;
  },
});

/**
 * Update a changelog entry
 */
export const update = mutation({
  args: {
    id: v.id("changelog"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("feature"),
        v.literal("fix"),
        v.literal("improvement"),
        v.literal("security"),
        v.literal("breaking")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    const now = Date.now();

    const existing = await ctx.db.get(id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.version !== undefined) updateData.version = updates.version;
    if (updates.type !== undefined) updateData.type = updates.type;

    await ctx.db.patch(id, updateData);

    return id;
  },
});

/**
 * Publish a changelog entry
 */
export const publish = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.patch(args.id, {
      isPublished: true,
      publishedAt: now,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Unpublish a changelog entry
 */
export const unpublish = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.patch(args.id, {
      isPublished: false,
      updatedAt: now,
    });

    return args.id;
  },
});

/**
 * Delete a changelog entry
 */
export const remove = mutation({
  args: { id: v.id("changelog") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Changelog entry not found");
    }

    await ctx.db.delete(args.id);
  },
});
