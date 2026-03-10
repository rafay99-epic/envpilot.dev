import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Project Members - Project-level access control
 *
 * Controls which users have access to specific projects.
 * Admins have implicit access to all projects (no projectMembers record needed).
 * Team leads and members must be explicitly assigned to projects.
 */

const PROJECT_ROLE_VALIDATOR = v.union(
  v.literal("viewer"),
  v.literal("developer"),
  v.literal("manager")
);

// ==========================================
// QUERIES
// ==========================================

/**
 * List all members of a project with user details
 */
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const membersWithUsers = await Promise.all(
      members.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        const addedByUser = await ctx.db.get(member.addedBy);
        return {
          ...member,
          user: user
            ? {
                _id: user._id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
              }
            : null,
          addedByUser: addedByUser
            ? { name: addedByUser.name, email: addedByUser.email }
            : null,
        };
      })
    );

    return membersWithUsers.filter((m) => m.user !== null);
  },
});

/**
 * Check if a user is a member of a specific project
 */
export const getProjectMembership = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();
  },
});

/**
 * Get org members who can be assigned to a project
 * (i.e., org members who are NOT already project members)
 */
export const getAssignableOrgMembers = query({
  args: {
    projectId: v.id("projects"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    // Get requesting user's org membership
    const requesterMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.requestingUserId)
      )
      .first();

    if (!requesterMembership) return [];

    // Must be org admin or project manager to assign members
    const isOrgAdmin = requesterMembership.role === "admin";
    if (!isOrgAdmin) {
      // Check if they're a project manager
      const projectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.requestingUserId)
        )
        .first();

      if (!projectMembership || projectMembership.role !== "manager") {
        return [];
      }
    }

    // Get all org members
    const allOrgMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    // Get existing project members
    const existingProjectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const assignedUserIds = new Set(
      existingProjectMembers.map((m) => m.userId.toString())
    );

    // Filter: exclude admins (implicit access), already-assigned, and self
    const assignable = await Promise.all(
      allOrgMembers
        .filter((member) => {
          if (member.role === "admin") return false;
          if (assignedUserIds.has(member.userId.toString())) return false;
          if (member.userId === args.requestingUserId) return false;
          return true;
        })
        .map(async (member) => {
          const user = await ctx.db.get(member.userId);
          return user
            ? {
                _id: user._id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                orgRole: member.role,
              }
            : null;
        })
    );

    return assignable.filter(Boolean);
  },
});

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Add a member to a project
 */
export const addMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: PROJECT_ROLE_VALIDATOR,
    addedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Verify caller is authorized (org admin or project manager)
    const callerOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.addedBy)
      )
      .first();

    if (!callerOrgMembership) {
      throw new Error("Not authorized: caller is not an org member");
    }

    const isOrgAdmin = callerOrgMembership.role === "admin";

    if (!isOrgAdmin) {
      const callerProjectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.addedBy)
        )
        .first();

      if (
        !callerProjectMembership ||
        callerProjectMembership.role !== "manager"
      ) {
        throw new Error(
          "Not authorized: only org admins and project managers can add project members"
        );
      }
    }

    // Verify target user is an org member
    const targetOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!targetOrgMembership) {
      throw new Error("Target user is not a member of the organization");
    }

    // Admins don't need project membership (implicit access)
    if (targetOrgMembership.role === "admin") {
      throw new Error("Admins have implicit access to all projects");
    }

    // Check for existing project membership
    const existing = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();

    if (existing) {
      throw new Error("User is already a member of this project");
    }

    const membershipId = await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
      role: args.role,
      addedBy: args.addedBy,
      addedAt: now,
    });

    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.addedBy,
      action: "project.member_added",
      details: JSON.stringify({
        addedUserId: args.userId,
        addedUserEmail: targetUser?.email,
        projectRole: args.role,
      }),
      createdAt: now,
    });

    return membershipId;
  },
});

/**
 * Remove a member from a project
 * Also revokes their variable permissions and project access tokens
 */
export const removeMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    removedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Verify caller authorization
    const callerOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.removedBy)
      )
      .first();

    if (!callerOrgMembership) {
      throw new Error("Not authorized");
    }

    const isOrgAdmin = callerOrgMembership.role === "admin";

    if (!isOrgAdmin) {
      const callerProjectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.removedBy)
        )
        .first();

      if (
        !callerProjectMembership ||
        callerProjectMembership.role !== "manager"
      ) {
        throw new Error(
          "Not authorized: only org admins and project managers can remove project members"
        );
      }
    }

    const membership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this project");
    }

    // Revoke variable permissions for this project's variables
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    let revokedPermissions = 0;
    for (const variable of variables) {
      const perms = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable_and_user", (q) =>
          q.eq("variableId", variable._id).eq("userId", args.userId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const perm of perms) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.removedBy,
        });
        revokedPermissions++;
      }
    }

    // Revoke project access tokens (extension/CLI)
    const activeTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const token of activeTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: args.userId,
        reason: "Removed from project",
        revokedBy: args.removedBy,
        revokedAt: now,
        acknowledged: false,
        expiresAt: revocationExpiresAt,
      });
    }

    // Delete the project membership
    await ctx.db.delete(membership._id);

    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.removedBy,
      action: "project.member_removed",
      details: JSON.stringify({
        removedUserId: args.userId,
        removedUserEmail: targetUser?.email,
        revokedPermissions,
        revokedTokens: activeTokens.length,
      }),
      createdAt: now,
    });

    return membership._id;
  },
});

/**
 * Update a project member's role
 */
export const updateMemberRole = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    newRole: PROJECT_ROLE_VALIDATOR,
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Verify caller authorization
    const callerOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.updatedBy)
      )
      .first();

    if (!callerOrgMembership) {
      throw new Error("Not authorized");
    }

    const isOrgAdmin = callerOrgMembership.role === "admin";

    if (!isOrgAdmin) {
      const callerProjectMembership = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", args.updatedBy)
        )
        .first();

      if (
        !callerProjectMembership ||
        callerProjectMembership.role !== "manager"
      ) {
        throw new Error(
          "Not authorized: only org admins and project managers can update project member roles"
        );
      }
    }

    const membership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this project");
    }

    const oldRole = membership.role;
    await ctx.db.patch(membership._id, { role: args.newRole });

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.updatedBy,
      action: "project.member_role_changed",
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
 * Bulk add members to a project
 * Used during project creation and invitation acceptance
 */
export const bulkAddMembers = mutation({
  args: {
    projectId: v.id("projects"),
    userIds: v.array(v.id("users")),
    role: PROJECT_ROLE_VALIDATOR,
    addedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    const addedIds: Id<"projectMembers">[] = [];

    for (const userId of args.userIds) {
      // Skip if already a member
      const existing = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", args.projectId).eq("userId", userId)
        )
        .first();

      if (existing) continue;

      // Skip admins (implicit access)
      const orgMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", project.organizationId).eq("userId", userId)
        )
        .first();

      if (!orgMembership || orgMembership.role === "admin") continue;

      const id = await ctx.db.insert("projectMembers", {
        projectId: args.projectId,
        userId,
        role: args.role,
        addedBy: args.addedBy,
        addedAt: now,
      });

      addedIds.push(id);
    }

    if (addedIds.length > 0) {
      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: args.addedBy,
        action: "project.member_added",
        details: JSON.stringify({
          bulkAdd: true,
          count: addedIds.length,
          projectRole: args.role,
        }),
        createdAt: now,
      });
    }

    return addedIds;
  },
});
