import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_NOTIFICATIONS = {
  variableChanges: true,
  memberUpdates: true,
  accessRequests: true,
  securityAlerts: true,
};

export const getByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!prefs) {
      return {
        emailNotifications: DEFAULT_NOTIFICATIONS,
      };
    }

    return {
      emailNotifications: prefs.emailNotifications ?? DEFAULT_NOTIFICATIONS,
    };
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    emailNotifications: v.optional(
      v.object({
        variableChanges: v.boolean(),
        memberUpdates: v.boolean(),
        accessRequests: v.boolean(),
        securityAlerts: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: now };
      if (args.emailNotifications !== undefined) {
        updates.emailNotifications = args.emailNotifications;
      }
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("userPreferences", {
      userId: args.userId,
      emailNotifications: args.emailNotifications,
      updatedAt: now,
    });
  },
});
