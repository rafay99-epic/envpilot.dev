import { query } from "../../../_generated/server";
import { v } from "convex/values";

/**
 * Changelog Queries
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

    // Fetch published entries and filter by type (supports both single and multi-type)
    const entries = await ctx.db
      .query("changelog")
      .withIndex("by_published", (q) => q.eq("isPublished", true))
      .order("desc")
      .collect();

    // Filter entries that include the requested type (backward compat with single type)
    const matched = entries.filter((e) => {
      const entryTypes = e.types ?? [e.type];
      return entryTypes.includes(args.type);
    });

    // Sort by publishedAt descending and limit
    return matched
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
