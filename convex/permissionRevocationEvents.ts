import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";

/**
 * Permission Revocation Events
 * Handles real-time notification of permission revocations to VS Code extension
 */

// Event TTL: 24 hours (events older than this will be cleaned up)
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new revocation event when a token is revoked
 */
export const create = mutation({
  args: {
    accessToken: v.string(),
    projectId: v.id("projects"),
    userId: v.id("users"),
    reason: v.string(),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const eventId = await ctx.db.insert("permissionRevocationEvents", {
      accessToken: args.accessToken,
      projectId: args.projectId,
      userId: args.userId,
      reason: args.reason,
      revokedBy: args.revokedBy,
      revokedAt: now,
      acknowledged: false,
      expiresAt: now + EVENT_TTL_MS,
    });

    return eventId;
  },
});

/**
 * Check for pending revocation events for a specific access token
 * This is polled by the extension to detect real-time revocations
 */
export const checkForToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .filter((q) => q.eq(q.field("acknowledged"), false))
      .first();

    if (!event) {
      return null;
    }

    return {
      eventId: event._id,
      projectId: event.projectId,
      userId: event.userId,
      reason: event.reason,
      revokedAt: event.revokedAt,
    };
  },
});

/**
 * Check for any pending revocation events for multiple tokens
 * More efficient for checking multiple projects at once
 */
export const checkForTokens = query({
  args: { accessTokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    const events: Array<{
      accessToken: string;
      eventId: string;
      projectId: string;
      userId: string;
      reason: string;
      revokedAt: number;
    }> = [];

    for (const accessToken of args.accessTokens) {
      const event = await ctx.db
        .query("permissionRevocationEvents")
        .withIndex("by_access_token", (q) => q.eq("accessToken", accessToken))
        .filter((q) => q.eq(q.field("acknowledged"), false))
        .first();

      if (event) {
        events.push({
          accessToken,
          eventId: event._id,
          projectId: event.projectId,
          userId: event.userId,
          reason: event.reason,
          revokedAt: event.revokedAt,
        });
      }
    }

    return events;
  },
});

/**
 * Acknowledge a revocation event (marks it as processed)
 */
export const acknowledge = mutation({
  args: { eventId: v.id("permissionRevocationEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return false;
    }

    await ctx.db.patch(args.eventId, {
      acknowledged: true,
      acknowledgedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Acknowledge multiple revocation events at once
 */
export const acknowledgeMultiple = mutation({
  args: { eventIds: v.array(v.id("permissionRevocationEvents")) },
  handler: async (ctx, args) => {
    const now = Date.now();
    let count = 0;

    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (event && !event.acknowledged) {
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
    const now = Date.now();

    // Get all expired events
    const expiredEvents = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_expires_at")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    // Get all acknowledged events older than 1 hour
    const oneHourAgo = now - 60 * 60 * 1000;
    const acknowledgedEvents = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", true))
      .filter((q) =>
        q.and(
          q.eq(q.field("acknowledged"), true),
          q.lt(q.field("acknowledgedAt"), oneHourAgo)
        )
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

/**
 * Get all pending revocation events for a user
 * Useful for fetching all revocations when the extension starts
 */
export const getPendingForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("acknowledged"), false))
      .collect();

    return events.map((event) => ({
      eventId: event._id,
      accessToken: event.accessToken,
      projectId: event.projectId,
      reason: event.reason,
      revokedAt: event.revokedAt,
    }));
  },
});
