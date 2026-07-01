import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { isCronPaused } from "./tierLimits";

/**
 * Permission Revocation Events
 * Handles real-time notification of permission revocations to VS Code extension
 */

// Event TTL: 24 hours (events older than this will be cleaned up)
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Create a new revocation event when a token is revoked.
 *
 * NOTE: This is called only by trusted server code (API routes that have
 * already validated a session / bearer token). All in-app revocation paths
 * insert the event inline via ctx.db.insert rather than calling this mutation.
 * It is kept public for those server routes; the actor is supplied as
 * `revokedBy`, which the calling route MUST populate from the authenticated
 * session — not from untrusted request input.
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
      .collect()
      .then((rows) => rows.find((doc) => doc.acknowledged === false) ?? null);

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
        .collect()
        .then((rows) => rows.find((doc) => doc.acknowledged === false) ?? null);

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
 * Acknowledge a revocation event (marks it as processed).
 *
 * Authorization: a revocation event is only ever acknowledged by the client
 * (CLI/extension) belonging to the user whose access was revoked. The caller
 * MUST pass its own user id; acknowledging another user's event is rejected so
 * one client can't clear (and thereby suppress) another user's revocation.
 */
export const acknowledge = mutation({
  args: {
    eventId: v.id("permissionRevocationEvents"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) {
      return false;
    }

    if (event.userId !== args.userId) {
      throw new Error("You can only acknowledge your own revocation events");
    }

    await ctx.db.patch(args.eventId, {
      acknowledged: true,
      acknowledgedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Acknowledge multiple revocation events at once.
 *
 * Authorization: same as `acknowledge` — the caller may only acknowledge
 * events that belong to it. Events owned by another user are skipped rather
 * than throwing, so a partially-mismatched batch still clears what it may.
 */
export const acknowledgeMultiple = mutation({
  args: {
    eventIds: v.array(v.id("permissionRevocationEvents")),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    let count = 0;

    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (event && !event.acknowledged && event.userId === args.userId) {
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

    // Get all acknowledged events older than 1 hour
    const oneHourAgo = now - 60 * 60 * 1000;
    const acknowledgedEvents = await ctx.db
      .query("permissionRevocationEvents")
      .withIndex("by_acknowledged", (q) => q.eq("acknowledged", true))
      .collect()
      .then((rows) =>
        rows.filter(
          (doc) =>
            doc.acknowledgedAt !== undefined && doc.acknowledgedAt < oneHourAgo
        )
      );

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
      .collect()
      .then((rows) => rows.filter((doc) => doc.acknowledged === false));

    return events.map((event) => ({
      eventId: event._id,
      accessToken: event.accessToken,
      projectId: event.projectId,
      reason: event.reason,
      revokedAt: event.revokedAt,
    }));
  },
});
