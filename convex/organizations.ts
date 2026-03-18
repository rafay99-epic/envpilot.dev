import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  getTierLimitsFromDb,
  getOrganizationTier,
  getDefaultTierName,
} from "./tierLimits";
import { rateLimiter } from "./rateLimits";

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
    // Rate limit: prevent excessive org creation
    await rateLimiter.limit(ctx, "orgCreate", {
      key: args.createdBy,
      throws: true,
    });

    const now = Date.now();

    // Check organization creation limits based on user's tier
    const userMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.createdBy))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    // Find the most permissive org limit among owned orgs
    let bestOrgLimit: number | null = 0;
    for (const membership of userMemberships) {
      const tier = await getOrganizationTier(ctx.db, membership.organizationId);
      const limits = await getTierLimitsFromDb(ctx.db, tier);
      if (limits.maxOrganizations === null) {
        bestOrgLimit = null;
        break;
      }
      if (bestOrgLimit !== null && limits.maxOrganizations > bestOrgLimit) {
        bestOrgLimit = limits.maxOrganizations;
      }
    }

    // If no owned orgs yet, use default tier limits
    if (userMemberships.length === 0) {
      const defaultTier = await getDefaultTierName(ctx.db);
      const defaultLimits = await getTierLimitsFromDb(ctx.db, defaultTier);
      bestOrgLimit = defaultLimits.maxOrganizations;
    }

    if (bestOrgLimit !== null && userMemberships.length >= bestOrgLimit) {
      throw new Error(
        `Organization limit reached (${userMemberships.length}/${bestOrgLimit}). Upgrade your tier for more organizations.`
      );
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
      workosOrgId: args.workosOrgId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Create tier record using the default tier from tierDefinitions
    const defaultTier = await getDefaultTierName(ctx.db);
    await ctx.db.insert("organizationTiers", {
      organizationId,
      tier: defaultTier,
      updatedAt: now,
      updatedBy: args.createdBy,
      reason: "org_created",
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
 * Delete an organization with full cascade cleanup
 */
export const remove = mutation({
  args: {
    organizationId: v.id("organizations"),
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    // Audit log first (before deleting)
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.deletedBy,
      action: "org.deleted",
      createdAt: now,
    });

    // Fetch ALL projects (including soft-deleted)
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    for (const project of projects) {
      // Soft-delete variables
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      for (const variable of variables) {
        await ctx.db.patch(variable._id, { deletedAt: now, updatedAt: now });

        // Delete variable versions
        const versions = await ctx.db
          .query("variableVersions")
          .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
          .collect();
        for (const version of versions) {
          await ctx.db.delete(version._id);
        }

        // Deactivate variable permissions
        const permissions = await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
          .filter((q) => q.eq(q.field("isActive"), true))
          .collect();
        for (const perm of permissions) {
          await ctx.db.patch(perm._id, {
            isActive: false,
            revokedAt: now,
            revokedBy: args.deletedBy,
          });
        }
      }

      // Delete project members
      const projectMembers = await ctx.db
        .query("projectMembers")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      for (const pm of projectMembers) {
        await ctx.db.delete(pm._id);
      }

      // Revoke project access tokens
      const accessTokens = await ctx.db
        .query("projectAccess")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      for (const token of accessTokens) {
        await ctx.db.patch(token._id, { isActive: false });
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: token.accessToken,
          projectId: project._id,
          userId: token.userId,
          reason: "Organization deleted",
          revokedBy: args.deletedBy,
          revokedAt: now,
          acknowledged: false,
          expiresAt: revocationExpiresAt,
        });
      }

      // Cancel pending variable requests
      const pendingRequests = await ctx.db
        .query("environmentVariableRequests")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", project._id).eq("status", "pending")
        )
        .collect();
      for (const req of pendingRequests) {
        await ctx.db.patch(req._id, {
          status: "canceled",
          reviewReason: "Organization deleted",
          reviewedBy: args.deletedBy,
          reviewedAt: now,
          updatedAt: now,
        });
      }

      // Delete the project record
      await ctx.db.delete(project._id);
    }

    // Delete invitations
    const invitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const inv of invitations) {
      await ctx.db.delete(inv._id);
    }

    // Delete subscriptions
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const sub of subscriptions) {
      await ctx.db.delete(sub._id);
    }

    // Delete stripe customers
    const stripeCustomers = await ctx.db
      .query("stripeCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const sc of stripeCustomers) {
      await ctx.db.delete(sc._id);
    }

    // Delete organization tier record
    const tierRecord = await ctx.db
      .query("organizationTiers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
    if (tierRecord) {
      await ctx.db.delete(tierRecord._id);
    }

    // Delete org members
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
    }

    // Delete the organization
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

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = await getTierLimitsFromDb(ctx.db, tier);
    if (limits.maxTeamMembers !== null) {
      const currentMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();

      if (currentMembers.length >= limits.maxTeamMembers) {
        throw new Error(
          `Team member limit reached (${currentMembers.length}/${limits.maxTeamMembers}). Upgrade your tier for more team members.`
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

    // Revoke all active CLI tokens for this user
    const activeCliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    for (const cliToken of activeCliTokens) {
      await ctx.db.patch(cliToken._id, { isActive: false, revokedAt: now });
      revokedTokenCount++;
    }

    // Also clean up all projectMembers records for this user
    const allProjectMemberships = await Promise.all(
      projects.map(async (project) => {
        return await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", project._id).eq("userId", args.userId)
          )
          .collect();
      })
    );

    for (const memberships of allProjectMemberships) {
      for (const pm of memberships) {
        await ctx.db.delete(pm._id);
      }
    }

    // Revoke all active variable permissions for this user across org projects
    let revokedPermissionCount = 0;
    const activePermissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    const orgProjectIds = new Set(projects.map((p) => p._id));

    for (const perm of activePermissions) {
      const variable = await ctx.db.get(perm.variableId);
      if (variable && orgProjectIds.has(variable.projectId)) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.removedBy,
        });
        revokedPermissionCount++;
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
        revokedVariablePermissions: revokedPermissionCount,
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

    // When demoting from admin to non-admin, auto-create projectMembers
    // for all org projects so the user doesn't lose access
    if (oldRole === "admin" && args.newRole !== "admin") {
      const orgProjects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      for (const project of orgProjects) {
        const existingPm = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", project._id).eq("userId", args.userId)
          )
          .first();

        if (!existingPm) {
          await ctx.db.insert("projectMembers", {
            projectId: project._id,
            userId: args.userId,
            role: args.newRole === "team_lead" ? "manager" : "developer",
            addedBy: args.updatedBy,
            addedAt: now,
          });
        }
      }
    }

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

/**
 * Update organization settings
 * Only admins can modify settings
 */
export const updateSettings = mutation({
  args: {
    organizationId: v.id("organizations"),
    settings: v.object({
      teamLeadsCanCreateProjects: v.boolean(),
    }),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.updatedBy)
      )
      .first();

    if (!membership || membership.role !== "admin") {
      throw new Error("Only admins can update organization settings");
    }

    await ctx.db.patch(args.organizationId, {
      settings: args.settings,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.updatedBy,
      action: "org.updated",
      details: JSON.stringify({ settings: args.settings }),
      createdAt: now,
    });

    return args.organizationId;
  },
});

// ==========================================
// SESSION MANAGEMENT
// ==========================================

/**
 * Get all active sessions (CLI tokens + extension links) for a member.
 * Only admins and team leads can view another member's sessions.
 */
export const getMemberSessions = query({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    callerUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify caller is admin or team_lead
    const callerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.callerUserId)
      )
      .first();

    if (
      !callerMembership ||
      (callerMembership.role !== "admin" &&
        callerMembership.role !== "team_lead")
    ) {
      throw new Error("Only admins and team leads can view member sessions");
    }

    // Verify target is a member of this org
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this organization");
    }

    // Get active CLI tokens
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.targetUserId).eq("isActive", true)
      )
      .collect();

    const maskedCliTokens = cliTokens.map((token) => ({
      _id: token._id,
      deviceName: token.deviceName || "Unknown device",
      lastUsedAt: token.lastUsedAt,
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      tokenPreview: token.accessToken.slice(0, 8) + "...",
    }));

    // Get active extension sessions across all org projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const extensionSessions = [];
    for (const project of projects) {
      const accessRecords = await ctx.db
        .query("projectAccess")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", args.targetUserId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const access of accessRecords) {
        extensionSessions.push({
          _id: access._id,
          projectId: project._id,
          projectName: project.name,
          deviceName: access.deviceName || "Unknown device",
          lastUsedAt: access.lastUsedAt,
          createdAt: access.createdAt,
          expiresAt: access.expiresAt,
          tokenPreview: access.accessToken.slice(0, 8) + "...",
        });
      }
    }

    return { cliTokens: maskedCliTokens, extensionSessions };
  },
});

/**
 * Revoke a specific CLI token for a member.
 */
export const revokeMemberCliToken = mutation({
  args: {
    organizationId: v.id("organizations"),
    tokenId: v.id("cliTokens"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify caller is admin or team_lead
    const callerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.revokedBy)
      )
      .first();

    if (
      !callerMembership ||
      (callerMembership.role !== "admin" &&
        callerMembership.role !== "team_lead")
    ) {
      throw new Error("Only admins and team leads can revoke sessions");
    }

    const token = await ctx.db.get(args.tokenId);
    if (!token || !token.isActive) {
      throw new Error("Token not found or already revoked");
    }

    await ctx.db.patch(args.tokenId, { isActive: false, revokedAt: now });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.revokedBy,
      action: "access.token_revoked",
      details: JSON.stringify({
        tokenId: args.tokenId,
        targetUserId: token.userId,
        deviceName: token.deviceName,
        type: "cli",
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Revoke a specific extension session (project access) for a member.
 */
export const revokeMemberExtensionSession = mutation({
  args: {
    organizationId: v.id("organizations"),
    projectAccessId: v.id("projectAccess"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    // Verify caller is admin or team_lead
    const callerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.revokedBy)
      )
      .first();

    if (
      !callerMembership ||
      (callerMembership.role !== "admin" &&
        callerMembership.role !== "team_lead")
    ) {
      throw new Error("Only admins and team leads can revoke sessions");
    }

    const access = await ctx.db.get(args.projectAccessId);
    if (!access || !access.isActive) {
      throw new Error("Extension session not found or already revoked");
    }

    // Verify the project belongs to this org
    const project = await ctx.db.get(access.projectId);
    if (!project || project.organizationId !== args.organizationId) {
      throw new Error("Project does not belong to this organization");
    }

    await ctx.db.patch(args.projectAccessId, { isActive: false });

    // Create revocation event for real-time extension sync
    await ctx.db.insert("permissionRevocationEvents", {
      accessToken: access.accessToken,
      projectId: access.projectId,
      userId: access.userId,
      reason: "Session revoked by administrator",
      revokedBy: args.revokedBy,
      revokedAt: now,
      acknowledged: false,
      expiresAt: revocationExpiresAt,
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.revokedBy,
      action: "access.extension_unlinked",
      details: JSON.stringify({
        projectAccessId: args.projectAccessId,
        targetUserId: access.userId,
        projectId: access.projectId,
        deviceName: access.deviceName,
        type: "extension",
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

/**
 * Revoke ALL active sessions (CLI + extension) for a member
 * without removing them from the organization.
 */
export const revokeAllMemberSessions = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    // Verify caller is admin or team_lead
    const callerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.revokedBy)
      )
      .first();

    if (
      !callerMembership ||
      (callerMembership.role !== "admin" &&
        callerMembership.role !== "team_lead")
    ) {
      throw new Error("Only admins and team leads can revoke sessions");
    }

    // Verify target is a member
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("User is not a member of this organization");
    }

    let revokedCliCount = 0;
    let revokedExtensionCount = 0;

    // Revoke all active CLI tokens
    const activeCliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.targetUserId).eq("isActive", true)
      )
      .collect();

    for (const token of activeCliTokens) {
      await ctx.db.patch(token._id, { isActive: false, revokedAt: now });
      revokedCliCount++;
    }

    // Revoke all active extension sessions across org projects
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    for (const project of projects) {
      const activeTokens = await ctx.db
        .query("projectAccess")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", args.targetUserId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const token of activeTokens) {
        await ctx.db.patch(token._id, { isActive: false });
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: token.accessToken,
          projectId: project._id,
          userId: args.targetUserId,
          reason: "All sessions revoked by administrator",
          revokedBy: args.revokedBy,
          revokedAt: now,
          acknowledged: false,
          expiresAt: revocationExpiresAt,
        });
        revokedExtensionCount++;
      }
    }

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.revokedBy,
      action: "access.token_revoked",
      details: JSON.stringify({
        targetUserId: args.targetUserId,
        revokedCliTokens: revokedCliCount,
        revokedExtensionSessions: revokedExtensionCount,
        type: "all",
      }),
      createdAt: now,
    });

    return {
      success: true,
      revokedCliTokens: revokedCliCount,
      revokedExtensionSessions: revokedExtensionCount,
    };
  },
});

/**
 * Transfer organization ownership to another user.
 * All members, projects, variables, and settings remain intact.
 * Only the owner (createdBy) changes and the new owner gets admin role.
 */
export const transferOwnership = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
    transferredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify caller is admin
    const callerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.transferredBy)
      )
      .first();

    if (!callerMembership || callerMembership.role !== "admin") {
      throw new Error("Only admins can transfer organization ownership");
    }

    // Verify target user exists
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Cannot transfer to yourself
    if (args.targetUserId === args.transferredBy) {
      throw new Error("Cannot transfer ownership to yourself");
    }

    // Tier check — ownership transfer is allowed for all tiers
    // (removed hardcoded pro-only restriction)

    // Add or promote target user to admin
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (targetMembership) {
      await ctx.db.patch(targetMembership._id, { role: "admin" });
    } else {
      await ctx.db.insert("organizationMembers", {
        organizationId: args.organizationId,
        userId: args.targetUserId,
        role: "admin",
        joinedAt: now,
        invitedBy: args.transferredBy,
      });
    }

    // Remove previous owner from the organization
    await ctx.db.delete(callerMembership._id);

    // Update org creator
    await ctx.db.patch(args.organizationId, {
      createdBy: args.targetUserId,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.transferredBy,
      action: "org.transferred",
      details: JSON.stringify({
        transferredFrom: args.transferredBy,
        transferredTo: args.targetUserId,
      }),
      createdAt: now,
    });

    return args.organizationId;
  },
});
