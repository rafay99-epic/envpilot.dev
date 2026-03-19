import { v } from "convex/values";
import { mutation, query, internalQuery } from "./_generated/server";
import { resolveFeatureForUser } from "./featureRegistry";

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
        keyboardShortcuts: {},
      };
    }

    return {
      emailNotifications: prefs.emailNotifications ?? DEFAULT_NOTIFICATIONS,
      keyboardShortcuts: prefs.keyboardShortcuts ?? {},
    };
  },
});

export const getByUserIdInternal = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!prefs) {
      return {
        emailNotifications: DEFAULT_NOTIFICATIONS,
        keyboardShortcuts: {},
      };
    }

    return {
      emailNotifications: prefs.emailNotifications ?? DEFAULT_NOTIFICATIONS,
      keyboardShortcuts: prefs.keyboardShortcuts ?? {},
    };
  },
});

export const upsert = mutation({
  args: {
    userId: v.id("users"),
    callerUserId: v.id("users"),
    emailNotifications: v.optional(
      v.object({
        variableChanges: v.boolean(),
        memberUpdates: v.boolean(),
        accessRequests: v.boolean(),
        securityAlerts: v.boolean(),
      })
    ),
    keyboardShortcuts: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    if (args.callerUserId !== args.userId) {
      throw new Error("You can only update your own preferences");
    }

    // If keyboard shortcuts are being updated, check feature gate
    if (args.keyboardShortcuts !== undefined) {
      const shortcutCheck = await resolveFeatureForUser(
        ctx.db,
        args.userId,
        "keyboard_shortcuts_custom"
      );
      if (shortcutCheck.value !== true) {
        throw new Error("Custom keyboard shortcuts are not available on your current tier.");
      }
    }

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
      if (args.keyboardShortcuts !== undefined) {
        updates.keyboardShortcuts = args.keyboardShortcuts;
      }
      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("userPreferences", {
      userId: args.userId,
      emailNotifications: args.emailNotifications,
      keyboardShortcuts: args.keyboardShortcuts,
      updatedAt: now,
    });
  },
});
