import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const ACCESS_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function generateToken(prefix: string): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const maxValid = 256 - (256 % chars.length); // 248 for 62 chars — reject 248-255
  const result: string[] = [prefix];
  while (result.length - 1 < 48) {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < maxValid && result.length - 1 < 48) {
        result.push(chars.charAt(byte % chars.length));
      }
    }
  }
  return result.join("");
}

export const createToken = mutation({
  args: {
    userId: v.id("users"),
    deviceName: v.string(),
    deviceId: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const accessToken = generateToken("mob_");
    const refreshToken = generateToken("mob_refresh_");

    await ctx.db.insert("mobileTokens", {
      userId: args.userId,
      accessToken,
      refreshToken,
      deviceName: args.deviceName,
      deviceId: args.deviceId,
      platform: args.platform,
      lastUsedAt: now,
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

export const validateToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mobileTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .unique();

    if (!token) {
      return { valid: false as const, reason: "Token not found" };
    }
    if (!token.isActive) {
      return { valid: false as const, reason: "Token revoked" };
    }
    if (token.expiresAt < Date.now()) {
      return { valid: false as const, reason: "Token expired" };
    }

    const user = await ctx.db.get(token.userId);
    if (!user) {
      return { valid: false as const, reason: "User not found" };
    }

    return {
      valid: true as const,
      userId: token.userId,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

export const refreshToken = mutation({
  args: { refreshToken: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mobileTokens")
      .withIndex("by_refresh_token", (q) =>
        q.eq("refreshToken", args.refreshToken)
      )
      .unique();

    if (!token || !token.isActive) {
      throw new Error("Invalid or expired token");
    }

    if (token.expiresAt < Date.now()) {
      await ctx.db.patch(token._id, { isActive: false });
      throw new Error("Invalid or expired token");
    }

    const user = await ctx.db.get(token.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const now = Date.now();
    const newAccessToken = generateToken("mob_");
    const newRefreshToken = generateToken("mob_refresh_");

    await ctx.db.patch(token._id, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
      lastUsedAt: now,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresAt: now + ACCESS_TOKEN_EXPIRY_MS,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    };
  },
});

export const revokeToken = mutation({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mobileTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .unique();

    if (token) {
      await ctx.db.patch(token._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    return { success: true };
  },
});

export const updateLastUsed = mutation({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const token = await ctx.db
      .query("mobileTokens")
      .withIndex("by_access_token", (q) =>
        q.eq("accessToken", args.accessToken)
      )
      .unique();

    if (token && token.isActive) {
      await ctx.db.patch(token._id, { lastUsedAt: Date.now() });
    }
  },
});

export const listUserTokens = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const tokens = await ctx.db
      .query("mobileTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    return tokens
      .filter((t) => t.isActive)
      .map((t) => ({
        _id: t._id,
        deviceName: t.deviceName,
        platform: t.platform,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      }));
  },
});
