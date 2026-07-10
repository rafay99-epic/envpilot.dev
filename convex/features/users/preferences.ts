import { v } from "convex/values";
import { mutation, query, internalQuery } from "../../_generated/server";
import { resolveFeatureForUser } from "../featureRegistry/resolver";
import { requireAuthedUser } from "../../lib/identity";

const DEFAULT_NOTIFICATIONS = {
  variableChanges: true,
  memberUpdates: true,
  accessRequests: true,
  securityAlerts: true,
  rotationReminders: true,
};

export const getByUserId = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
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
    emailNotifications: v.optional(
      v.object({
        variableChanges: v.boolean(),
        memberUpdates: v.boolean(),
        accessRequests: v.boolean(),
        securityAlerts: v.boolean(),
        rotationReminders: v.optional(v.boolean()),
      })
    ),
    keyboardShortcuts: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (ctx, args) => {
    // Self-service only: the acting user is derived from the verified identity.
    const actor = await requireAuthedUser(ctx);

    // If keyboard shortcuts are being updated, check feature gate
    if (args.keyboardShortcuts !== undefined) {
      const shortcutCheck = await resolveFeatureForUser(
        ctx.db,
        actor._id,
        "keyboard_shortcuts_custom"
      );
      if (shortcutCheck.value !== true) {
        throw new Error(
          "Custom keyboard shortcuts are not available on your current tier."
        );
      }
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
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
      userId: actor._id,
      emailNotifications: args.emailNotifications,
      keyboardShortcuts: args.keyboardShortcuts,
      updatedAt: now,
    });
  },
});
