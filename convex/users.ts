import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * User Queries and Mutations
 */

export const getById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

export const getByWorkosId = query({
  args: { workosId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
      .first();
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const search = query({
  args: {
    searchTerm: v.string(),
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const searchLower = args.searchTerm.toLowerCase();
    const limit = args.limit ?? 10;

    // Only search users who are members of the specified organization
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));

    const matches = users
      .filter(
        (user): user is NonNullable<typeof user> =>
          user !== null &&
          (user.email.toLowerCase().includes(searchLower) ||
            (user.name?.toLowerCase().includes(searchLower) ?? false))
      )
      .slice(0, limit);

    return matches;
  },
});

export const upsert = mutation({
  args: {
    workosId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_workos_id", (q) => q.eq("workosId", args.workosId))
      .first();

    if (existingUser) {
      await ctx.db.patch(existingUser._id, {
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
        lastActiveAt: now,
      });
      return existingUser._id;
    }

    const userId = await ctx.db.insert("users", {
      workosId: args.workosId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      createdAt: now,
      lastActiveAt: now,
    });

    return userId;
  },
});

export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    callerUserId: v.id("users"),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.callerUserId !== args.userId) {
      throw new Error("You can only update your own profile");
    }
    const { userId, callerUserId: _caller, ...updates } = args;

    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.avatarUrl !== undefined)
      updateData.avatarUrl = updates.avatarUrl;

    await ctx.db.patch(userId, updateData);

    return userId;
  },
});

export const updateLastActive = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      lastActiveAt: Date.now(),
    });
  },
});

export const getOwnSessions = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    return {
      cli: cliTokens.map((t) => ({
        id: t._id,
        type: "cli" as const,
        deviceName: t.deviceName ?? "CLI",
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
        expiresAt: t.expiresAt,
      })),
      extension: extensionSessions.map((s) => ({
        id: s._id,
        type: "extension" as const,
        deviceName: s.deviceName ?? "VS Code Extension",
        lastUsedAt: s.lastUsedAt,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      })),
    };
  },
});

export const revokeOwnSessions = mutation({
  args: { userId: v.id("users"), callerUserId: v.id("users") },
  handler: async (ctx, args) => {
    if (args.callerUserId !== args.userId) {
      throw new Error("You can only revoke your own sessions");
    }
    const now = Date.now();
    let count = 0;

    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const token of cliTokens) {
      await ctx.db.patch(token._id, { isActive: false, revokedAt: now });
      count++;
    }

    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const session of extensionSessions) {
      await ctx.db.patch(session._id, { isActive: false });
      count++;
    }

    return { revoked: count };
  },
});

export const remove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const membership of memberships) {
      await ctx.db.delete(membership._id);
    }

    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const perm of permissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    const accessTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const token of accessTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
      });
    }

    await ctx.db.delete(args.userId);

    return args.userId;
  },
});
