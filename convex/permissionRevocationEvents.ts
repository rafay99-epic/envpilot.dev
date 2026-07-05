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
 * Acknowledge multiple revocation events at once (extension bearer surface).
 *
 * The acting user is resolved INSIDE Convex from the presented token —
 * deliberately WITHOUT active/expiry checks, because acknowledging a
 * "your access was revoked" event legitimately happens with an
 * already-revoked or expired token. Possession of the token string proves
 * the caller was that device; a made-up userId can no longer be passed.
 *
 * Authorization: the caller may only acknowledge events that belong to the
 * token's owner. Events owned by another user are skipped rather than
 * throwing, so a partially-mismatched batch still clears what it may.
 */
export const acknowledgeMultipleForToken = mutation({
  args: {
    accessToken: v.string(),
    eventIds: v.array(v.id("permissionRevocationEvents")),
  },
  returns: v.object({ acknowledgedCount: v.number() }),
  handler: async (ctx, args) => {
    // Lenient owner resolution: projectAccess first (extension project
    // tokens), then cliTokens (session tokens). Existence only — see docstring.
    const projectToken = await ctx.db
      .query("projectAccess")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();
    const cliToken = projectToken
      ? null
      : await ctx.db
          .query("cliTokens")
          .withIndex("by_access_token", (q) =>
            q.eq("accessToken", args.accessToken)
          )
          .first();
    const ownerId = projectToken?.userId ?? cliToken?.userId;
    if (!ownerId) {
      throw new Error("Unauthenticated: unknown access token");
    }

    const now = Date.now();
    let count = 0;

    for (const eventId of args.eventIds) {
      const event = await ctx.db.get(eventId);
      if (event && !event.acknowledged && event.userId === ownerId) {
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
