import { v } from "convex/values";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  getRoleProfile,
  hasCapability,
  isSuspendedMembership,
  normalizeOrgRole,
} from "../../lib/authz";

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
    // NOTE: intentionally NOT gated with requireAuthedUser — this query is
    // composed by several server routes through the unauthenticated
    // ConvexHttpClient (they enforce their own withAuth() first), e.g.
    // api/projects/[id]/members, api/variables, api/invitations,
    // api/users/search. Adding an identity requirement here 500s all of them.
    // The security-relevant fix is the field pick below: suspendReason /
    // suspendedBy are audit-only and never leave this query.
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        // Expose only what the members UI needs. `status`/`suspendedAt` drive
        // the "Suspended" badge; suspendReason + suspendedBy are audit-only
        // and MUST NOT leak to members (least of all the suspended one).
        return user
          ? {
              _id: membership._id,
              organizationId: membership.organizationId,
              userId: membership.userId,
              role: membership.role,
              joinedAt: membership.joinedAt,
              invitedBy: membership.invitedBy,
              status: membership.status,
              suspendedAt: membership.suspendedAt,
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

    // Resolve notify eligibility here (queries have ctx.db; the consuming
    // email ACTION does not) — one profile resolution per distinct slug.
    const notifyMemo = new Map<string, boolean>();
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        if (!user) return null;
        const slug = normalizeOrgRole(membership.role);
        if (!notifyMemo.has(slug)) {
          const profile = await getRoleProfile(ctx, slug);
          notifyMemo.set(
            slug,
            hasCapability(profile, "notify.variable_changes")
          );
        }
        return {
          ...membership,
          notifyVariableChanges: notifyMemo.get(slug) === true,
          user: {
            _id: user._id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
          },
        };
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
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .first();
  // A suspended member is denied everywhere this "am I a member / what's my
  // role" helper gates access (vault value reads in variables/values.ts, role
  // checks). They surface as a non-member; the hold screen learns their state
  // via securityHold.getMyMembershipStatus instead. This also means the
  // audit-only suspendReason/suspendedBy fields never reach the target.
  if (!membership || isSuspendedMembership(membership)) return null;
  return membership;
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
