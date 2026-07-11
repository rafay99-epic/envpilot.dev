import { v } from "convex/values";
import { mutation, query, internalMutation } from "../../_generated/server";
import { isCronPaused } from "../billing/tierLimits";
import { requireAuthedUser } from "../../lib/identity";

/**
 * Permission Revocation Events
 * Handles real-time notification of permission revocations to VS Code extension
 */

// Event TTL: 24 hours (events older than this will be cleaned up)
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * List the caller's own pending (unacknowledged) revocation events.
 *
 * Identity-scoped replacement for the old token-keyed `checkForTokens`: the VS
 * Code extension attaches its WorkOS JWT (requireAuthedUser) and polls for
 * revocations targeting its user, instead of passing the raw project-access
 * tokens it holds. Events for other users are structurally unreachable.
 */
export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      accessToken: v.string(),
      eventId: v.id("permissionRevocationEvents"),
      projectId: v.id("projects"),
      userId: v.id("users"),
      reason: v.string(),
      revokedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);

    const rows = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    return rows
      .filter((doc) => doc.acknowledged === false)
      .map((event) => ({
        accessToken: event.accessToken,
        eventId: event._id,
        projectId: event.projectId,
        userId: event.userId,
        reason: event.reason,
        revokedAt: event.revokedAt,
      }));
  },
});

/**
 * Acknowledge the caller's own revocation events.
 *
 * Identity-scoped replacement for `acknowledgeMultipleForToken`: identity is
 * the WorkOS JWT (requireAuthedUser). The caller may only acknowledge events
 * whose `userId` is their own — events owned by another user are skipped rather
 * than throwing, so a partially-mismatched batch still clears what it may.
 */
export const acknowledgeMine = mutation({
  args: {
    eventIds: v.array(v.id("permissionRevocationEvents")),
  },
  returns: v.object({ acknowledgedCount: v.number() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const now = Date.now();
    let count = 0;

    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (event && !event.acknowledged && event.userId === actor._id) {
        await ctx.db.patch(eventId, {
          acknowledged: true,
          acknowledgedAt: now,
        });
        count++;
      }
    }

    return { acknowledgedCount: count };
  },
});

/**
 * Clean up old acknowledged or expired events
 * Should be called periodically (e.g., by a cron job)
 */
export const cleanup = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_revocation_events"))
      return;

    const now = Date.now();

    // Get all expired events
    const expiredEvents = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .collect();

    // Get acknowledged events older than 1 hour. The compound index range
    // (with a `.gt(0)` floor to exclude undefined acknowledgedAt, which
    // sorts below all numbers) reads only rows actually old enough to
    // delete, instead of collecting every acknowledged row each run.
    const oneHourAgo = now - 60 * 60 * 1000;
    const acknowledgedEvents = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_acknowledged_and_ack_at", (q) =>
        q
          .eq("acknowledged", true)
          .gt("acknowledgedAt", 0)
          .lt("acknowledgedAt", oneHourAgo)
      )
      .collect();

    // Delete expired events
    for (const event of expiredEvents) {
      await ctx.db.delete(event._id);
    }

    // Delete acknowledged events
    for (const event of acknowledgedEvents) {
      await ctx.db.delete(event._id);
    }

    return {
      deletedExpired: expiredEvents.length,
      deletedAcknowledged: acknowledgedEvents.length,
    };
  },
});
