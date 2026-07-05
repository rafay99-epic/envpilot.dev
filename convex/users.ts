import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireAuthedUser } from "./identity";

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
      if (existingUser.isBanned) {
        throw new Error(
          "Your account has been suspended." +
            (existingUser.banReason
              ? ` Reason: ${existingUser.banReason}`
              : " Please contact support for more information.")
        );
      }

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
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Self-service only: the acting user is derived from the verified identity,
    // so a caller can only ever update their own profile.
    const actor = await requireAuthedUser(ctx);

    const updateData: Record<string, unknown> = {};
    if (args.name !== undefined) updateData.name = args.name;
    if (args.avatarUrl !== undefined) updateData.avatarUrl = args.avatarUrl;

    await ctx.db.patch(actor._id, updateData);

    return actor._id;
  },
});

export const getOwnSessions = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);

    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", actor._id).eq("isActive", true)
      )
      .collect();

    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

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
  args: {},
  handler: async (ctx) => {
    // Self-service only: revokes the acting user's own sessions.
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();
    let count = 0;

    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", actor._id).eq("isActive", true)
      )
      .collect();

    for (const token of cliTokens) {
      await ctx.db.patch(token._id, { isActive: false, revokedAt: now });
      count++;
    }

    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    for (const session of extensionSessions) {
      await ctx.db.patch(session._id, { isActive: false });
      count++;
    }

    return { revoked: count };
  },
});
