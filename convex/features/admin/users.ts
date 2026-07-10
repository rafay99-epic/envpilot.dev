import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { normalizeOrgRole } from "../../authz";
import { verifyAdmin } from "./auth";

export const listUsers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const users = await ctx.db.query("users").order("desc").take(500);

    const results = await Promise.all(
      users.map(async (user) => {
        const memberships = await ctx.db
          .query("organizationMembers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        return { ...user, organizationCount: memberships.length };
      })
    );

    return results;
  },
});

export const banUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    banReason: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: true,
      bannedAt: Date.now(),
      bannedBy: "admin",
      banReason: args.banReason,
    });

    // Revoke all active CLI tokens for this user
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    for (const token of cliTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    // Revoke all active extension sessions (projectAccess) for this user
    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const session of extensionSessions) {
      if (session.isActive) {
        await ctx.db.patch(session._id, { isActive: false });
      }
    }
  },
});

export const unbanUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: false,
      bannedAt: undefined,
      bannedBy: undefined,
      banReason: undefined,
    });
  },
});

/** List all user tiers with user info and owned org count */
export const listUserTiers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const userTierRecords = await ctx.db.query("userTiers").take(200);

    return await Promise.all(
      userTierRecords.map(async (ut) => {
        const user = await ctx.db.get(ut.userId);
        const ownedOrgs = await ctx.db
          .query("organizationMembers")
          .withIndex("by_user", (q) => q.eq("userId", ut.userId))
          .collect()
          .then((rows) =>
            rows.filter((doc) => normalizeOrgRole(doc.role) === "owner")
          );

        // Check grace period
        const grace = await ctx.db
          .query("subscriptionGracePeriods")
          .withIndex("by_user", (q) => q.eq("userId", ut.userId))
          .first();
        const graceActive =
          grace?.isActive === true && grace.gracePeriodEnd > Date.now();

        return {
          ...ut,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email ?? "Unknown",
          ownedOrgCount: ownedOrgs.length,
          graceActive,
          gracePeriodEnd: graceActive ? grace!.gracePeriodEnd : undefined,
        };
      })
    );
  },
});

/** Assign tier to a user */
export const updateUserTier = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    tier: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const now = Date.now();

    // Validate tier exists
    const tierDef = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.tier))
      .first();
    if (!tierDef) {
      throw new Error(`Tier "${args.tier}" not found`);
    }

    // Upsert userTiers
    const existing = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: args.tier,
        updatedAt: now,
        reason: args.reason ?? "admin.manual_assignment",
      });
    } else {
      await ctx.db.insert("userTiers", {
        userId: args.userId,
        tier: args.tier,
        updatedAt: now,
        reason: args.reason ?? "admin.manual_assignment",
      });
    }
  },
});
