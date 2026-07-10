import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { verifyAdmin } from "./auth";

/**
 * List all registered cron jobs with their pause status.
 * Crons are statically defined at deploy time — this returns
 * metadata + runtime pause state from adminSettings.
 */
export const listCronJobs = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Static cron registry — mirrors convex/crons.ts
    const cronRegistry = [
      {
        name: "cleanup expired project access",
        function: "projectAccess.cleanupExpired",
        interval: "Every 1 hour",
        settingKey: "cron_pause_cleanup_project_access",
      },
      {
        name: "cleanup revocation events",
        function: "permissionRevocationEvents.cleanup",
        interval: "Every 1 hour",
        settingKey: "cron_pause_cleanup_revocation_events",
      },
      {
        name: "cleanup expired invitations",
        function: "invitations.cleanupExpired",
        interval: "Every 6 hours",
        settingKey: "cron_pause_cleanup_invitations",
      },
      {
        name: "cleanup expired permissions",
        function: "permissions.cleanupExpired",
        interval: "Daily at 3:00 AM UTC",
        settingKey: "cron_pause_cleanup_permissions",
      },
      {
        name: "expire grace periods",
        function: "subscriptions.expireGracePeriods",
        interval: "Every 1 hour",
        settingKey: "cron_pause_expire_grace_periods",
      },
      {
        name: "process secret rotation expiry",
        function: "variables.processRotationExpiry",
        interval: "Every 1 hour",
        settingKey: "cron_pause_rotation_expiry",
      },
    ];

    const settings = await ctx.db.query("adminSettings").collect();
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    return cronRegistry.map((cron) => ({
      ...cron,
      paused: settingsMap.get(cron.settingKey) === "true",
    }));
  },
});

/**
 * Toggle pause state for a cron job.
 * The cron still fires on schedule but the handler skips all work when paused.
 */
export const toggleCronPause = mutation({
  args: {
    secret: v.string(),
    settingKey: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Validate it's a known cron setting key
    if (!args.settingKey.startsWith("cron_pause_")) {
      throw new Error("Invalid cron setting key");
    }

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.settingKey))
      .first();

    const currentlyPaused = existing?.value === "true";
    const newValue = currentlyPaused ? "false" : "true";

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: newValue,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.settingKey,
        value: newValue,
        updatedAt: Date.now(),
      });
    }

    return { paused: !currentlyPaused };
  },
});
