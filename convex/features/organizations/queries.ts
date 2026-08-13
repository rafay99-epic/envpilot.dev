import { v } from "convex/values";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  getActiveMembership,
  getRoleProfile,
  hasCapability,
  isSuspendedMembership,
  normalizeOrgRole,
} from "../../lib/authz";

const organizationForMemberValidator = v.object({
  _id: v.id("organizations"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
  logoUrl: v.optional(v.string()),
  settings: v.optional(v.object({ teamLeadsCanCreateProjects: v.boolean() })),
  workosOrgId: v.optional(v.string()),
  createdBy: v.id("users"),
  createdAt: v.number(),
  updatedAt: v.number(),
  role: v.string(),
});

const organizationMemberValidator = v.object({
  _id: v.id("organizationMembers"),
  organizationId: v.id("organizations"),
  userId: v.id("users"),
  role: v.string(),
  joinedAt: v.number(),
  invitedBy: v.optional(v.id("users")),
  status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
  suspendedAt: v.optional(v.number()),
  user: v.object({
    _id: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
  }),
});

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

/** Authenticated dashboard lookup. Legacy server adapters use getBySlug. */
export const getBySlugForCurrentUser = query({
  args: { slug: v.string() },
  returns: v.union(organizationForMemberValidator, v.null()),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const organization = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();
    if (!organization) return null;

    const membership = await getActiveMembership(
      ctx,
      organization._id,
      actor._id
    );
    if (!membership) return null;
    return { ...organization, role: membership.role };
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

/** Authenticated member list for reactive dashboard clients. */
export const getMembersForCurrentUser = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(organizationMemberValidator),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return [];

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const members = await Promise.all(
      memberships.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return user
          ? {
              _id: member._id,
              organizationId: member.organizationId,
              userId: member.userId,
              role: member.role,
              joinedAt: member.joinedAt,
              invitedBy: member.invitedBy,
              status: member.status,
              suspendedAt: member.suspendedAt,
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
    return members.filter((member) => member !== null);
  },
});

export const getMemberCountForCurrentUser = query({
  args: { organizationId: v.id("organizations") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await getActiveMembership(
      ctx,
      args.organizationId,
      actor._id
    );
    if (!membership) return 0;
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(1001);
    return members.length;
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
    // email ACTION does not). Resolve each distinct slug ONCE before the
    // fan-out — a memo inside Promise.all would race past its own cache.
    const notifyMemo = new Map<string, boolean>();
    for (const membership of memberships) {
      const slug = normalizeOrgRole(membership.role);
      if (!notifyMemo.has(slug)) {
        const profile = await getRoleProfile(ctx, slug);
        notifyMemo.set(slug, hasCapability(profile, "notify.variable_changes"));
      }
    }
    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        if (!user) return null;
        const slug = normalizeOrgRole(membership.role);
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
