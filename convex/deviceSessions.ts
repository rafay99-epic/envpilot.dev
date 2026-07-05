import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireAuthedUser } from "./identity";

/**
 * Device-session records for the CLI and VS Code extension.
 *
 * Since the Stage 2 WorkOS device-flow cutover, authentication is a real
 * WorkOS JWT — the client's token is NEVER stored server-side. This module
 * writes a lightweight DISPLAY / REVOKE record into `cliTokens` so a
 * device-flow login still shows up in the active-sessions UI and can be
 * remotely signed out. Identity is always the JWT (requireAuthedUser); the row
 * is not a credential.
 */

// The row's expiry is cosmetic (the JWT/refresh-token governs real access), so
// push it far into the future — the row lives until explicitly revoked.
const FAR_FUTURE_MS = 100 * 365 * 24 * 60 * 60 * 1000; // ~100 years

/**
 * Record (or refresh) the caller's device session after a WorkOS device-flow
 * login. Called ONCE by the CLI/extension right after login, decoding the
 * WorkOS session id (`sid`) from their own JWT to pass as `sessionId`.
 *
 * Upsert semantics: when `sessionId` is provided and a row for this user with
 * that session already exists, it is refreshed in place; otherwise a new row is
 * inserted. Returns the row id.
 */
export const record = mutation({
  args: {
    deviceName: v.string(),
    clientType: v.union(v.literal("cli"), v.literal("extension")),
    sessionId: v.optional(v.string()),
  },
  returns: v.id("cliTokens"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    // Reuse an existing row for the same WorkOS session so repeated logins /
    // refreshes don't pile up duplicate active sessions.
    if (args.sessionId) {
      const existing = await ctx.db
        .query("cliTokens")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect()
        .then(
          (rows) => rows.find((row) => row.sessionId === args.sessionId) ?? null
        );

      if (existing) {
        await ctx.db.patch(existing._id, {
          deviceName: args.deviceName,
          clientType: args.clientType,
          isActive: true,
          lastUsedAt: now,
          expiresAt: now + FAR_FUTURE_MS,
          revokedAt: undefined,
        });
        return existing._id;
      }
    }

    return await ctx.db.insert("cliTokens", {
      userId: actor._id,
      deviceName: args.deviceName,
      clientType: args.clientType,
      sessionId: args.sessionId,
      isActive: true,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: now + FAR_FUTURE_MS,
    });
  },
});

/**
 * Deactivate the caller's own device-session row(s) for a WorkOS session id —
 * called best-effort by CLI/extension logout so the device disappears from the
 * active-sessions UI. Scoped to the caller's rows only (a user cannot touch
 * another user's sessions). WorkOS-side session revocation is not needed for
 * self-logout: the client discards its refresh token and the access token
 * expires within minutes; the web "revoke this device" flow does the real
 * WorkOS revocation server-side.
 */
export const revoke = mutation({
  args: { sessionId: v.string() },
  returns: v.object({ revokedCount: v.number() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const rows = await ctx.db
      .query("cliTokens")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();

    let count = 0;
    for (const row of rows) {
      if (row.sessionId === args.sessionId && row.isActive) {
        await ctx.db.patch(row._id, { isActive: false, revokedAt: now });
        count++;
      }
    }
    return { revokedCount: count };
  },
});
