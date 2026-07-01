import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import {
  assertProjectAction,
  assertCanManageUser,
  normalizeOrgRole,
  roleLevel,
} from "./authz";

/**
 * Project Members - Project-level access control
 *
 * projectMembers rows are pure scope ASSIGNMENTS under the unified role model:
 * what a user can do inside an assigned project is derived from their
 * organizationMembers.role. Owners have implicit access to all projects
 * (no projectMembers record needed); everyone else must be explicitly
 * assigned. The legacy per-row `role` field is neither written nor read by
 * this module anymore.
 */

// Legacy project-level role values — accepted (and ignored) for backward
// compatibility with older clients that still send them.
const LEGACY_PROJECT_ROLE_VALIDATOR = v.union(
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

    // Must be allowed to manage project members (owner bypasses assignment;
    // project managers and team leads need an assignment)
    let requesterRole: string;
    try {
      const auth = await assertProjectAction(
        ctx,
        args.requestingUserId,
        args.projectId,
        "project:manage_members"
      );
      requesterRole = auth.orgRole;
    } catch {
      return [];
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

    // Filter: exclude owners (implicit access), already-assigned, self, and
    // anyone at or above the requester's role (hierarchy: you may only assign
    // users strictly below your own role)
    const assignable = await Promise.all(
      allOrgMembers
        .filter((member) => {
          if (normalizeOrgRole(member.role) === "owner") return false;
          if (assignedUserIds.has(member.userId.toString())) return false;
          if (member.userId === args.requestingUserId) return false;
          if (roleLevel(member.role) >= roleLevel(requesterRole)) return false;
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
                orgRole: normalizeOrgRole(member.role),
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
 * Add a member to a project (pure scope assignment).
 *
 * Hierarchy rule: the actor may only add users whose org role is strictly
 * below their own. Owners are never added — they have implicit access.
 * The legacy `role` arg is accepted for API compatibility but ignored.
 */
export const addMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    // LEGACY: ignored — capabilities come from the member's org role
    role: v.optional(LEGACY_PROJECT_ROLE_VALIDATOR),
    addedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      args.addedBy,
      args.projectId,
      "project:manage_members"
    );

    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
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

    // Owners don't need project assignments (implicit access) — no-op
    if (normalizeOrgRole(targetOrgMembership.role) === "owner") {
      return null;
    }

    // Hierarchy: can only add users whose org role is strictly below your own
    assertCanManageUser(
      actorRole,
      targetOrgMembership.role,
      "add project member"
    );

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

    // Pure scope assignment — capabilities come from the org role
    const membershipId = await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
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
        orgRole: normalizeOrgRole(targetOrgMembership.role),
      }),
      createdAt: now,
    });

    return membershipId;
  },
});

/**
 * Remove a member from a project
 * Also revokes their variable permissions and project access tokens.
 *
 * Hierarchy rule: the actor may only remove users whose org role is strictly
 * below their own.
 */
export const removeMember = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    removedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      args.removedBy,
      args.projectId,
      "project:manage_members"
    );

    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
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

    // Hierarchy: can only remove users whose org role is strictly below your
    // own. (If the target no longer has an org membership, allow cleanup.)
    const targetOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (targetOrgMembership) {
      assertCanManageUser(
        actorRole,
        targetOrgMembership.role,
        "remove project member"
      );
    }

    // Revoke variable permissions for this project's variables
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    let revokedPermissions = 0;
    for (const variable of variables) {
      const perms = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable_and_user", (q) =>
          q.eq("variableId", variable._id).eq("userId", args.userId)
        )
        .collect()
        .then((rows) => rows.filter((doc) => doc.isActive === true));

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
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));

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
 * DEPRECATED — project-level roles were removed by the unified role model.
 *
 * Kept as an export because the web API route still references it; it now
 * throws unconditionally. Change the member's ORGANIZATION role instead
 * (organizations.updateMemberRole).
 */
export const updateMemberRole = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    newRole: LEGACY_PROJECT_ROLE_VALIDATOR,
    updatedBy: v.id("users"),
  },
  handler: async () => {
    throw new Error(
      "Project-level roles were replaced by the unified organization role; change the member's organization role instead."
    );
  },
});

/**
 * Bulk add members to a project (pure scope assignments).
 *
 * Hierarchy rule: only users whose org role is strictly below the actor's
 * are added; owners and out-of-hierarchy users are silently skipped.
 * The legacy `role` arg is accepted for API compatibility but ignored.
 */
export const bulkAddMembers = mutation({
  args: {
    projectId: v.id("projects"),
    userIds: v.array(v.id("users")),
    // LEGACY: ignored — capabilities come from each member's org role
    role: v.optional(LEGACY_PROJECT_ROLE_VALIDATOR),
    addedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      args.addedBy,
      args.projectId,
      "project:manage_members"
    );

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

      const orgMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", project.organizationId).eq("userId", userId)
        )
        .first();

      // Skip non-members and owners (implicit access)
      if (!orgMembership || normalizeOrgRole(orgMembership.role) === "owner") {
        continue;
      }

      // Hierarchy: skip users at or above the actor's role
      if (roleLevel(orgMembership.role) >= roleLevel(actorRole)) continue;

      // Pure scope assignment — capabilities come from the org role
      const id = await ctx.db.insert("projectMembers", {
        projectId: args.projectId,
        userId,
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
        }),
        createdAt: now,
      });
    }

    return addedIds;
  },
});
