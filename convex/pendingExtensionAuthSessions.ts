import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";

/**
 * Short-lived handshake records for the VS Code extension OAuth flow.
 *
 * Flow:
 *   1. Extension generates a random session token and opens the browser.
 *   2. Browser calls POST /api/extension/auth/callback — which calls `store`
 *      to persist the token + user info for 10 minutes.
 *   3. Extension polls GET /api/extension/auth/check — which calls `consume`
 *      to atomically read + delete the record.
 *
 * This table replaces an in-memory Map that did not work on serverless
 * because each Lambda invocation has its own isolated memory. A record
 * stored by the callback on one Lambda was invisible to the check endpoint
 * running on another Lambda, causing the extension to poll until timeout.
 */

const PENDING_SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Store a pending auth session after the user successfully authenticates
 * in the browser. Called from /api/extension/auth/callback.
 */
export const store = mutation({
  args: {
    sessionToken: v.string(),
    workosUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    accessToken: v.string(),
    refreshToken: v.string(),
    tokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // If a record already exists for this session token (e.g. user clicked
    // the auth link twice), replace it rather than duplicating.
    const existing = await ctx.db
      .query("pendingExtensionAuthSessions")
      .withIndex("by_session_token", (q) =>
        q.eq("sessionToken", args.sessionToken)
      )
      .first();

    const doc = {
      sessionToken: args.sessionToken,
      workosUserId: args.workosUserId,
      email: args.email,
      name: args.name,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      expiresAt: now + PENDING_SESSION_TTL_MS,
      createdAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, doc);
      return { ok: true };
    }

    await ctx.db.insert("pendingExtensionAuthSessions", doc);
    return { ok: true };
  },
});

/**
 * Atomically read and delete a pending auth session.
 * Called from /api/extension/auth/check when the extension polls.
 * Returns null if the session is missing or expired.
 */
export const consume = mutation({
  args: {
    sessionToken: v.string(),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db
      .query("pendingExtensionAuthSessions")
      .withIndex("by_session_token", (q) =>
        q.eq("sessionToken", args.sessionToken)
      )
      .first();

    if (!record) {
      return null;
    }

    // Always delete — whether it was expired or not, it has been consumed.
    await ctx.db.delete(record._id);

    if (record.expiresAt < Date.now()) {
      return null;
    }

    return {
      workosUserId: record.workosUserId,
      email: record.email,
      name: record.name ?? null,
      accessToken: record.accessToken,
      refreshToken: record.refreshToken,
      tokenExpiresAt: record.tokenExpiresAt,
    };
  },
});

/**
 * Cron cleanup for pending sessions that were never consumed.
 * Runs every 15 minutes.
 */
export const cleanupExpired = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("pendingExtensionAuthSessions")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .collect();

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    return { cleanedUp: expired.length };
  },
});
