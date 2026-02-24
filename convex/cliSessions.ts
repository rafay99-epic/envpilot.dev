import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";

// Constants
const SESSION_CODE_LENGTH = 8;
const SESSION_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes for auth code
const ACCESS_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for access token
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days for refresh token

/**
 * Generate a random alphanumeric code
 */
function generateCode(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars (0, O, I, 1)
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate a secure token
 */
function generateToken(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let token = prefix;
  for (let i = 0; i < 48; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
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
    } while (existingSession && existingSession.status === "pending");

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
 * Authenticate a CLI session (called from browser after user confirms)
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

    // Update session with authentication info
    await ctx.db.patch(session._id, {
      status: "authenticated",
      userId: args.userId,
      accessToken,
      refreshToken,
      authenticatedAt: now,
    });

    // Create CLI token record for long-term tracking
    await ctx.db.insert("cliTokens", {
      userId: args.userId,
      accessToken,
      refreshToken,
      deviceName: session.deviceName,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
      isActive: true,
      createdAt: now,
    });

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
      // Get user info
      const user = session.userId
        ? await ctx.db.get(session.userId)
        : null;

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
      .withIndex("by_access_token", (q) => q.eq("accessToken", args.accessToken))
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
      .withIndex("by_access_token", (q) => q.eq("accessToken", args.accessToken))
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
      .withIndex("by_refresh_token", (q) => q.eq("refreshToken", args.refreshToken))
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
      .withIndex("by_access_token", (q) => q.eq("accessToken", args.accessToken))
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
 * Clean up expired sessions (can be run periodically)
 */
export const cleanupExpiredSessions = mutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Find expired pending sessions
    const expiredSessions = await ctx.db
      .query("cliSessions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .collect();

    // Update status to expired
    for (const session of expiredSessions) {
      await ctx.db.patch(session._id, { status: "expired" });
    }

    return { cleanedUp: expiredSessions.length };
  },
});
