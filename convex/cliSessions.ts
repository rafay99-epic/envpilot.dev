import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { rateLimiter } from "./rateLimits";
import { isCronPaused } from "./tierLimits";

// Constants
const SESSION_CODE_LENGTH = 12;
const SESSION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes for auth code
const ACCESS_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for access token
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days for refresh token

/**
 * Generate a random alphanumeric code using a CSPRNG.
 * Uses crypto.getRandomValues() instead of Math.random() so that
 * session codes cannot be predicted by an attacker.
 */
function generateCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars (0, O, I, 1)
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(bytes[i] % chars.length);
  }
  return code;
}

/**
 * Generate a secure token using a CSPRNG.
 * Access and refresh tokens are long-lived (30–90 days) so they MUST
 * be generated with crypto.getRandomValues(), not Math.random().
 */
function generateToken(prefix: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  let token = prefix;
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(bytes[i] % chars.length);
  }
  return token;
}

/**
 * Initiate a new CLI authentication session
 */
export const initiate = mutation({
  args: {
    deviceName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Rate limit: prevent brute-force session generation
    await rateLimiter.limit(ctx, "cliAuthInitiate", {
      key: args.deviceName ?? "unknown",
      throws: true,
    });

    const now = Date.now();

    // Generate unique session code
    let code: string;
    let existingSession: Doc<"cliSessions"> | null;

    do {
      code = generateCode(SESSION_CODE_LENGTH);
      existingSession = await ctx.db
        .query("cliSessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
      // Reject codes that collide with ANY existing session — not just
      // pending ones. The old check allowed reuse when the previous session
      // was "authenticated" or "expired", but poll() uses .first() on the
      // same index, which could then return the OLD session (with stale or
      // missing tokens) instead of the new one.
    } while (existingSession);

    // Create session
    const sessionId = await ctx.db.insert("cliSessions", {
      code,
      status: "pending",
      deviceName: args.deviceName,
      expiresAt: now + SESSION_EXPIRY_MS,
      createdAt: now,
    });

    return {
      sessionId,
      code,
      expiresAt: now + SESSION_EXPIRY_MS,
    };
  },
});

/**
 * Get session by code (for browser authentication page)
 */
export const getByCode = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("cliSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!session) {
      return null;
    }

    // Check if expired
    if (session.expiresAt < Date.now()) {
      return { ...session, status: "expired" as const };
    }

    return session;
  },
});

/**
 * Authenticate a CLI session (called from browser after user confirms).
 *
 * TRUST BOUNDARY: the device flow binds the freshly issued CLI tokens to
 * `userId`. This mutation cannot itself prove the caller IS that user — the
 * pending cliSessions row records no intended user (it is created anonymously
 * by `initiate`). Therefore the browser route that calls this MUST pass the
 * withAuth() session user as `userId`, never a client-supplied value.
 * Confirmed caller: apps/web/src/app/cli/auth/page.tsx passes
 * `convexUser._id`, resolved from the authenticated WorkOS session — sound.
 * (Fully closable once ctx.auth lands and userId is derived server-side.)
 *
 * Defense in depth here: verify the pending session exists, is unconsumed
 * (status "pending") and not expired, then flip it to "authenticated"
 * atomically so the same code cannot be redeemed twice.
 */
export const authenticate = mutation({
  args: {
    code: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("cliSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "pending") {
      throw new Error("Session already processed");
    }

    if (session.expiresAt < Date.now()) {
      await ctx.db.patch(session._id, { status: "expired" });
      throw new Error("Session expired");
    }

    const now = Date.now();

    // Generate tokens
    const accessToken = generateToken("env_");
    const refreshToken = generateToken("env_refresh_");

    // Consume the session atomically: flip status to "authenticated" and bind
    // the user. The status guard above + this patch mean a second redemption
    // of the same code hits status !== "pending" and is rejected.
    await ctx.db.patch(session._id, {
      status: "authenticated",
      userId: args.userId,
      accessToken,
      refreshToken,
      authenticatedAt: now,
    });

    // Create CLI token record for long-term tracking.
    // organizationId is intentionally left unset — the CLI device flow is not
    // org-scoped, so there is no known org to attach here.
    await ctx.db.insert("cliTokens", {
      userId: args.userId,
      accessToken,
      refreshToken,
      deviceName: session.deviceName,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
      isActive: true,
      createdAt: now,
    });

    // NOTE: the auditLogs table requires an organizationId, but CLI device
    // auth has no org context (it authenticates a user, not an org action), so
    // an org-scoped audit row cannot be written here without fabricating an
    // org. The authenticated session is instead traceable via the cliSessions
    // (authenticatedAt) and cliTokens (createdAt) records themselves.

    return {
      accessToken,
      refreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
    };
  },
});

/**
 * Poll for authentication status (called by CLI)
 */
export const poll = query({
  args: {
    code: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("cliSessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!session) {
      return { status: "not_found" as const };
    }

    // Check if expired
    if (session.status === "pending" && session.expiresAt < Date.now()) {
      return { status: "expired" as const };
    }

    if (session.status === "authenticated") {
      // Guard: tokens must exist on an authenticated session. If they're
      // somehow missing (schema allows optional), surface it clearly so the
      // CLI can show a meaningful error instead of silently dropping creds.
      if (!session.accessToken || !session.refreshToken) {
        return { status: "not_found" as const };
      }

      // Get user info
      const user = session.userId ? await ctx.db.get(session.userId) : null;

      return {
        status: "authenticated" as const,
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        user: user
          ? {
              id: user._id,
              email: user.email,
              name: user.name,
            }
          : null,
      };
    }

    return { status: session.status };
  },
});

/**
 * Validate an access token
 */
export const validateToken = query({
  args: {
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const cliToken = await ctx.db
      .query("cliTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (!cliToken) {
      return { valid: false, reason: "Token not found" };
    }

    if (!cliToken.isActive) {
      return { valid: false, reason: "Token revoked" };
    }

    if (cliToken.expiresAt < Date.now()) {
      return { valid: false, reason: "Token expired" };
    }

    // Get user info
    const user = await ctx.db.get(cliToken.userId);
    if (!user) {
      return { valid: false, reason: "User not found" };
    }

    return {
      valid: true,
      userId: cliToken.userId,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

/**
 * Update last used timestamp for a token
 */
export const updateLastUsed = mutation({
  args: {
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const cliToken = await ctx.db
      .query("cliTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (cliToken) {
      await ctx.db.patch(cliToken._id, {
        lastUsedAt: Date.now(),
      });
    }
  },
});

/**
 * Refresh an access token
 */
export const refreshToken = mutation({
  args: {
    refreshToken: v.string(),
  },
  handler: async (ctx, args) => {
    const cliToken = await ctx.db
      .query("cliTokens")
      .withIndex("by_refresh_token", (q) =>
        q.eq("refreshToken", args.refreshToken)
      )
      .first();

    if (!cliToken) {
      throw new Error("Invalid refresh token");
    }

    if (!cliToken.isActive) {
      throw new Error("Token revoked");
    }

    const now = Date.now();

    // Generate new tokens
    const newAccessToken = generateToken("env_");
    const newRefreshToken = generateToken("env_refresh_");

    // Update token record
    await ctx.db.patch(cliToken._id, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
      lastUsedAt: now,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
    };
  },
});

/**
 * Revoke a token (logout)
 */
export const revokeToken = mutation({
  args: {
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    const cliToken = await ctx.db
      .query("cliTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .first();

    if (cliToken) {
      await ctx.db.patch(cliToken._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

/**
 * List active CLI tokens for a user
 */
export const listUserTokens = query({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    return tokens.map((token) => ({
      id: token._id,
      deviceName: token.deviceName,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt,
      // Mask the token for display
      tokenPreview: token.accessToken.slice(0, 12) + "...",
    }));
  },
});

/**
 * Revoke all CLI tokens for a user
 */
export const revokeAllUserTokens = mutation({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    const now = Date.now();

    for (const token of tokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
        revokedAt: now,
      });
    }

    return { revokedCount: tokens.length };
  },
});

/**
 * Store a token for the VS Code extension (reuses cliTokens table).
 *
 * TRUST BOUNDARY: this inserts an ACTIVE token bound to `userId`. It is called
 * only from the trusted extension OAuth callback route
 * (apps/web/src/app/api/extension/auth/callback/route.ts) via ConvexHttpClient,
 * which passes the withAuth() session user as `userId` and generates the
 * access/refresh tokens server-side. Because ConvexHttpClient cannot invoke
 * internalMutation, this must remain a public mutation; the calling route is
 * the trust boundary. The `userId` MUST come from the authenticated session,
 * never from untrusted request input. (Fully closable once ctx.auth lands.)
 */
export const storeExtensionToken = mutation({
  args: {
    userId: v.id("users"),
    accessToken: v.string(),
    refreshToken: v.string(),
    deviceName: v.optional(v.string()),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cliTokens", {
      userId: args.userId,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      deviceName: args.deviceName,
      expiresAt: args.expiresAt,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

/**
 * Clean up expired sessions (can be run periodically)
 */
export const cleanupExpiredSessions = internalMutation({
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_cli_sessions")) return;

    const now = Date.now();

    // Find expired pending sessions
    const expiredSessions = await ctx.db
      .query("cliSessions")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "pending").lt("expiresAt", now)
      )
      .collect();

    // Update status to expired
    for (const session of expiredSessions) {
      await ctx.db.patch(session._id, { status: "expired" });
    }

    return { cleanedUp: expiredSessions.length };
  },
});
