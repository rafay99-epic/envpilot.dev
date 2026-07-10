import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { verifyAdmin } from "./auth";

export const listAllChangelog = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db.query("changelog").order("desc").collect();
  },
});

export const createChangelog = mutation({
  args: {
    secret: v.string(),
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
    types: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("fix"),
          v.literal("improvement"),
          v.literal("security"),
          v.literal("breaking")
        )
      )
    ),
    isPublished: v.optional(v.boolean()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const now = Date.now();
    const typesArray = args.types ?? [args.type];
    const isPublished = args.isPublished ?? false;

    // Derive publish status
    let publishStatus: string;
    let publishedAt: number | undefined;

    if (args.scheduledFor && args.scheduledFor > now) {
      publishStatus = "scheduled";
      publishedAt = args.scheduledFor;
    } else if (isPublished) {
      publishStatus = "published";
      publishedAt = now;
    } else {
      publishStatus = "draft";
      publishedAt = undefined;
    }

    return await ctx.db.insert("changelog", {
      title: args.title,
      content: args.content,
      version: args.version,
      type: typesArray[0],
      types: typesArray,
      isPublished: publishStatus === "published",
      publishedAt,
      scheduledFor: args.scheduledFor,
      publishStatus,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChangelog = mutation({
  args: {
    secret: v.string(),
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
    types: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("fix"),
          v.literal("improvement"),
          v.literal("security"),
          v.literal("breaking")
        )
      )
    ),
    scheduledFor: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const now = Date.now();
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Changelog entry not found");

    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.version !== undefined) updates.version = args.version;

    // Handle types
    if (args.types !== undefined) {
      updates.types = args.types;
      updates.type = args.types[0]; // backward compat
    } else if (args.type !== undefined) {
      updates.type = args.type;
    }

    // Handle scheduling / publish status
    if (args.scheduledFor !== undefined || args.isPublished !== undefined) {
      const scheduledFor = args.scheduledFor ?? entry.scheduledFor;
      const isPublished = args.isPublished ?? entry.isPublished;

      if (scheduledFor && scheduledFor > now) {
        updates.publishStatus = "scheduled";
        updates.isPublished = false;
        updates.publishedAt = scheduledFor;
        updates.scheduledFor = scheduledFor;
      } else if (isPublished) {
        updates.publishStatus = "published";
        updates.isPublished = true;
        updates.publishedAt = entry.publishedAt ?? now;
        updates.scheduledFor = undefined;
      } else {
        updates.publishStatus = "draft";
        updates.isPublished = false;
        updates.scheduledFor = undefined;
      }
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const toggleChangelogPublish = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const entry = await ctx.db.get(args.id);
    if (!entry) {
      throw new Error("Changelog entry not found");
    }

    const now = Date.now();
    const newPublished = !entry.isPublished;
    await ctx.db.patch(args.id, {
      isPublished: newPublished,
      publishedAt: newPublished ? now : entry.publishedAt,
      publishStatus: newPublished ? "published" : "draft",
      scheduledFor: undefined, // Clear schedule on manual toggle
      updatedAt: now,
    });
  },
});

export const deleteChangelog = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});
