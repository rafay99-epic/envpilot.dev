import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalQuery, mutation, query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { assertOrgAction } from "../../lib/authz";

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

export const listAllForLoopsBackfill = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      email: u.email,
      name: u.name,
      id: u._id,
    }));
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

    await ctx.scheduler.runAfter(
      0,
      internal.features.emails.emails.sendWelcomeEmail,
      {
        to: args.email,
        name: args.name,
      }
    );

    await ctx.scheduler.runAfter(
      0,
      internal.features.emails.loops.syncContactToLoops,
      {
        email: args.email,
        name: args.name,
        userId: userId,
      }
    );

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

    // Since the device-flow cutover, cliTokens is the device-session record for
    // BOTH the CLI and the extension — split by clientType. Legacy rows with no
    // clientType are treated as CLI.
    const deviceSessions = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", actor._id).eq("isActive", true)
      )
      .collect();

    return {
      cli: deviceSessions
        .filter((t) => t.clientType !== "extension")
        .map((t) => ({
          id: t._id,
          type: "cli" as const,
          deviceName: t.deviceName ?? "CLI",
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
        })),
      extension: deviceSessions
        .filter((t) => t.clientType === "extension")
        .map((t) => ({
          id: t._id,
          type: "extension" as const,
          deviceName: t.deviceName ?? "VS Code Extension",
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
          expiresAt: t.expiresAt,
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
    // WorkOS session ids to revoke server-side (in the calling Next.js route,
    // which holds the WorkOS SDK) so remote sign-out is real.
    const sessionIds: string[] = [];

    const deviceSessions = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", actor._id).eq("isActive", true)
      )
      .collect();

    for (const token of deviceSessions) {
      await ctx.db.patch(token._id, { isActive: false, revokedAt: now });
      if (token.sessionId) sessionIds.push(token.sessionId);
      count++;
    }

    // Also tear down any active project-access (extension link) scoping records
    // so "sign out everywhere" fully de-scopes linked devices.
    const projectLinks = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

    for (const link of projectLinks) {
      await ctx.db.patch(link._id, { isActive: false });
      count++;
    }

    return { revoked: count, sessionIds };
  },
});

/**
 * Search an organization's members for the invite picker, annotated with
 * whether each result is already a member or already invited.
 *
 * Replaces GET /api/users/search, which composed this from three separate
 * queries and — because it reached `users.search` through the UNAUTHENTICATED
 * Convex client — left that query ungated. Anyone who knew an organization id
 * could enumerate its members. Authorization is required here, once, before
 * anything is read.
 */
export const searchForInvite = query({
  args: {
    searchTerm: v.string(),
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      isMember: v.boolean(),
      hasPendingInvitation: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Inviting is the reason to search, so the gate is the invite capability.
    await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:invite_member"
    );

    const searchLower = args.searchTerm.toLowerCase();
    const limit = args.limit ?? 10;

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const memberIds = new Set(members.map((m) => m.userId));

    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const now = Date.now();
    const pendingEmails = new Set(
      invitations
        .filter((i) => i.status === "pending" && i.expiresAt > now)
        .map((i) => i.email.toLowerCase())
    );

    const users = await Promise.all(members.map((m) => ctx.db.get(m.userId)));

    return users
      .filter(
        (user): user is NonNullable<typeof user> =>
          user !== null &&
          (user.email.toLowerCase().includes(searchLower) ||
            (user.name?.toLowerCase().includes(searchLower) ?? false))
      )
      .slice(0, limit)
      .map((user) => ({
        _id: user._id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        isMember: memberIds.has(user._id),
        hasPendingInvitation: pendingEmails.has(user.email.toLowerCase()),
      }));
  },
});
