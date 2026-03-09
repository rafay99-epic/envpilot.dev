import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getTierLimits, isValidTier, Tier } from "./tierLimits";

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
export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const organizations = await Promise.all(
      memberships.map(async (membership) => {
        const org = await ctx.db.get(membership.organizationId);
        return org ? { ...org, role: membership.role } : null;
      })
    );

    return organizations.filter(Boolean);
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
 * Check if a user is a member of an organization
 */
export const getMembership = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
  },
});

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Create a new organization
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    createdBy: v.id("users"),
    workosOrgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check organization creation limits based on user's tier
    const userMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.createdBy))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    // Check if user has any Pro tier organizations
    let hasPro = false;
    for (const membership of userMemberships) {
      const org = await ctx.db.get(membership.organizationId);
      if (org?.tier === "pro") {
        hasPro = true;
        break;
      }
    }

    const effectiveTier: Tier = hasPro ? "pro" : "free";
    const limits = getTierLimits(effectiveTier);

    if (limits.maxOrganizations !== null) {
      if (userMemberships.length >= limits.maxOrganizations) {
        throw new Error(
          `Organization limit reached (${userMemberships.length}/${limits.maxOrganizations}). Upgrade to Pro for unlimited organizations.`
        );
      }
    }

    const existingOrg = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .first();

    if (existingOrg) {
      throw new Error("Organization slug already exists");
    }

    const organizationId = await ctx.db.insert("organizations", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      logoUrl: args.logoUrl,
      tier: "free",
      workosOrgId: args.workosOrgId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("organizationMembers", {
      organizationId,
      userId: args.createdBy,
      role: "admin",
      joinedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId,
      userId: args.createdBy,
      action: "org.created",
      details: JSON.stringify({ name: args.name, slug: args.slug }),
      createdAt: now,
    });

    return organizationId;
  },
});

/**
 * Update an organization
 */
export const update = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { organizationId, updatedBy, ...updates } = args;

    const org = await ctx.db.get(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.logoUrl !== undefined) updateData.logoUrl = updates.logoUrl;

    await ctx.db.patch(organizationId, updateData);

    await ctx.db.insert("auditLogs", {
      organizationId,
      userId: updatedBy,
      action: "org.updated",
      details: JSON.stringify(updates),
      createdAt: now,
    });

    return organizationId;
  },
});

/**
 * Update organization tier
 *
 * NOTE: In production, this should be called from a payment provider webhook
 * (e.g., Stripe) to ensure tier changes are properly authorized.
 * Direct calls should be restricted to internal/admin operations only.
 */
export const updateTier = mutation({
  args: {
    organizationId: v.id("organizations"),
    tier: v.union(v.literal("free"), v.literal("pro")),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify the user is an admin of the organization
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.updatedBy)
      )
      .first();

    if (!membership || membership.role !== "admin") {
      throw new Error("Only organization admins can update the tier");
    }

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const previousTier = org.tier;

    await ctx.db.patch(args.organizationId, {
      tier: args.tier,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.updatedBy,
      action: "org.updated",
      details: JSON.stringify({
        tier: args.tier,
        previousTier,
        action: "tier_change",
      }),
      createdAt: now,
    });

    return args.organizationId;
  },
});

/**
 * Delete an organization
 */
export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.deletedBy,
      action: "org.deleted",
      createdAt: now,
    });

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    await ctx.db.delete(args.organizationId);

    return args.organizationId;
  },
});

/**
 * Add a member to an organization
 */
export const addMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    role: v.union(
      v.literal("admin"),
      v.literal("team_lead"),
      v.literal("member")
    ),
    invitedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check tier limits for adding team members
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const limits = getTierLimits(org.tier);
    if (limits.maxTeamMembers !== null) {
      const currentMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();

      if (currentMembers.length >= limits.maxTeamMembers) {
        throw new Error(
          `Team member limit reached (${currentMembers.length}/${limits.maxTeamMembers}). Upgrade to Pro for unlimited team members.`
        );
      }
    }

    const existingMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (existingMembership) {
      throw new Error("User is already a member of this organization");
    }

    const membershipId = await ctx.db.insert("organizationMembers", {
      organizationId: args.organizationId,
      userId: args.userId,
      role: args.role,
      joinedAt: now,
      invitedBy: args.invitedBy,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.invitedBy,
      action: "org.member_added",
      details: JSON.stringify({
        addedUserId: args.userId,
        role: args.role,
      }),
      createdAt: now,
    });

    return membershipId;
  },
});

/**
 * Remove a member from an organization
 */
export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    removedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    // Revoke all active extension/project access tokens for this user in this organization
    // so linked editors lose access and local cleanup can be triggered.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    let revokedTokenCount = 0;

    for (const project of projects) {
      const activeTokens = await ctx.db
        .query("projectAccess")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", args.userId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const token of activeTokens) {
        await ctx.db.patch(token._id, { isActive: false });
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: token.accessToken,
          projectId: project._id,
          userId: args.userId,
          reason: "Organization membership removed",
          revokedBy: args.removedBy,
          revokedAt: now,
          acknowledged: false,
          expiresAt: revocationExpiresAt,
        });
        revokedTokenCount++;
      }
    }

    await ctx.db.delete(membership._id);

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.removedBy,
      action: "org.member_removed",
      details: JSON.stringify({
        removedUserId: args.userId,
        revokedAccessTokens: revokedTokenCount,
      }),
      createdAt: now,
    });

    return membership._id;
  },
});

/**
 * Update a member's role
 */
export const updateMemberRole = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    newRole: v.union(
      v.literal("admin"),
      v.literal("team_lead"),
      v.literal("member")
    ),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this organization");
    }

    const oldRole = membership.role;

    await ctx.db.patch(membership._id, { role: args.newRole });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.updatedBy,
      action: "org.member_role_changed",
      details: JSON.stringify({
        targetUserId: args.userId,
        oldRole,
        newRole: args.newRole,
      }),
      createdAt: now,
    });

    return membership._id;
  },
});
