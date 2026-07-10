import { v } from "convex/values";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../identity";

/**
 * Organization Queries and Mutations
 * Handles all organization-related operations
 */

// ==========================================
// QUERIES
// ==========================================

/**
 * Get all organizations for a user
 */
async function listForUserCore(ctx: QueryCtx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const organizations = await Promise.all(
    memberships.map(async (membership) => {
      const org = await ctx.db.get(membership.organizationId);
      return org ? { ...org, role: membership.role } : null;
    })
  );

  return organizations.filter(Boolean);
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return listForUserCore(ctx, actor._id);
  },
});

/**
 * Get a single organization by ID
 */
export const getById = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/**
 * Get an organization by slug
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
  },
});

/**
 * Get all members of an organization
 */
export const getMembers = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user
          ? {
              ...membership,
              user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
              },
            }
          : null;
      })
    );

    return members.filter(Boolean);
  },
});

/**
 * Internal version of getMembers for use in server-side actions (e.g., email sending).
 */
export const getMembersInternal = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user
          ? {
              ...membership,
              user: {
                _id: user._id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
              },
            }
          : null;
      })
    );

    return members.filter(Boolean);
  },
});

/**
 * Check if a user is a member of an organization
 */
async function getMembershipCore(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">
) {
  return await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();
}

export const getMembership = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return getMembershipCore(ctx, args.organizationId, actor._id);
  },
});
