import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { batchGetUsers, userInfo } from "./helpers";

/**
 * Role hierarchy for permission management
 * Admin > Team Lead > Member
 */
const ROLE_HIERARCHY: Record<string, number> = {
  admin: 3,
  team_lead: 2,
  member: 1,
};

type PermissionCheckResult = {
  canManage: boolean;
  reason?: string;
  membership?: {
    role: string;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  };
};

/**
 * Check if a user can manage permissions for a variable
 * Returns the user's membership and whether they can manage permissions
 */
async function checkCanManagePermissions(
  ctx: MutationCtx | QueryCtx,
  variableId: Id<"environmentVariables">,
  userId: Id<"users">
): Promise<PermissionCheckResult> {
  const variable = await ctx.db.get(variableId);
  if (!variable || variable.deletedAt) {
    return { canManage: false, reason: "Variable not found" };
  }

  const project = await ctx.db.get(variable.projectId);
  if (!project || project.deletedAt) {
    return { canManage: false, reason: "Project not found" };
  }

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    return {
      canManage: false,
      reason: "User is not a member of the organization",
    };
  }

  // Only admins and team leads can manage permissions
  if (membership.role !== "admin" && membership.role !== "team_lead") {
    return {
      canManage: false,
      reason: "Only admins and team leads can manage variable permissions",
    };
  }

  return {
    canManage: true,
    membership: {
      role: membership.role,
      organizationId: membership.organizationId,
      userId: membership.userId,
    },
  };
}

/**
 * Permission Queries and Mutations
 */

// ==========================================
// QUERIES
// ==========================================

export const getForVariable = query({
  args: { variableId: v.id("environmentVariables") },
  handler: async (ctx, args) => {
    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .collect();

    const allUserIds = permissions.flatMap((p) => [
      p.userId,
      p.grantedBy,
      p.revokedBy,
    ]);
    const userMap = await batchGetUsers(ctx, allUserIds);

    return permissions.map((perm) => {
      const user = userMap.get(perm.userId.toString());
      const grantedBy = userMap.get(perm.grantedBy.toString());
      const revokedBy = perm.revokedBy
        ? userMap.get(perm.revokedBy.toString())
        : undefined;
      return {
        ...perm,
        user: userInfo(user),
        grantedByUser: grantedBy
          ? { name: grantedBy.name, email: grantedBy.email }
          : null,
        revokedByUser: revokedBy
          ? { name: revokedBy.name, email: revokedBy.email }
          : null,
      };
    });
  },
});

export const getForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    // Batch fetch variables
    const varIds = [...new Set(permissions.map((p) => p.variableId.toString()))];
    const variables = await Promise.all(
      varIds.map((id) => ctx.db.get(id as Id<"environmentVariables">))
    );
    const varMap = new Map(
      variables.filter(Boolean).map((v) => [v!._id.toString(), v!])
    );

    // Batch fetch projects from variables
    const projIds = [
      ...new Set(
        variables
          .filter((v) => v && !v.deletedAt)
          .map((v) => v!.projectId.toString())
      ),
    ];
    const projects = await Promise.all(
      projIds.map((id) => ctx.db.get(id as Id<"projects">))
    );
    const projMap = new Map(
      projects.filter(Boolean).map((p) => [p!._id.toString(), p!])
    );

    return permissions
      .map((perm) => {
        const variable = varMap.get(perm.variableId.toString());
        if (!variable || variable.deletedAt) return null;

        const project = projMap.get(variable.projectId.toString());
        return {
          ...perm,
          variable: {
            _id: variable._id,
            key: variable.key,
            description: variable.description,
          },
          project: project
            ? { _id: project._id, name: project.name, slug: project.slug }
            : null,
        };
      })
      .filter(Boolean);
  },
});

export const checkPermission = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
    requiredPermission: v.union(
      v.literal("read"),
      v.literal("write"),
      v.literal("admin")
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const permission = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable_and_user", (q) =>
        q.eq("variableId", args.variableId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!permission) {
      return { hasPermission: false, reason: "No permission granted" };
    }

    if (permission.expiresAt && permission.expiresAt < now) {
      return { hasPermission: false, reason: "Permission expired" };
    }

    const permissionLevels: Record<string, number> = {
      read: 1,
      write: 2,
      admin: 3,
    };
    const hasPermission =
      permissionLevels[permission.permission] >=
      permissionLevels[args.requiredPermission];

    return {
      hasPermission,
      grantedPermission: permission.permission,
      expiresAt: permission.expiresAt,
    };
  },
});

export const getHistory = query({
  args: {
    variableId: v.id("environmentVariables"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .take(args.limit ?? 100);

    const sorted = [...permissions].sort((a, b) => b.grantedAt - a.grantedAt);

    const historyWithUsers = await Promise.all(
      sorted.map(async (perm) => {
        const user = await ctx.db.get(perm.userId);
        const grantedBy = await ctx.db.get(perm.grantedBy);

        return {
          ...perm,
          userName: user?.name ?? user?.email ?? "Unknown",
          grantedByName: grantedBy?.name ?? grantedBy?.email ?? "Unknown",
        };
      })
    );

    return historyWithUsers;
  },
});

/**
 * Get members who can be assigned permissions for a variable
 * For Team Leads: only members
 * For Admins: all members except themselves
 */
export const getAssignableMembers = query({
  args: {
    variableId: v.id("environmentVariables"),
    requestingUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      return [];
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Get the requesting user's membership
    const requesterMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.requestingUserId)
      )
      .first();

    if (!requesterMembership) {
      return [];
    }

    // Only admins and team leads can manage permissions
    if (
      requesterMembership.role !== "admin" &&
      requesterMembership.role !== "team_lead"
    ) {
      return [];
    }

    // Get all organization members
    const allMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    // Get existing permissions for this variable
    const existingPermissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const usersWithPermissions = new Set(
      existingPermissions.map((p) => p.userId.toString())
    );

    // Filter members based on requester's role
    const assignableMembers = await Promise.all(
      allMembers
        .filter((member) => {
          // Don't include users who already have permissions
          if (usersWithPermissions.has(member.userId.toString())) {
            return false;
          }

          // Don't include the requester themselves
          if (member.userId === args.requestingUserId) {
            return false;
          }

          // Team leads can only assign to members
          if (requesterMembership.role === "team_lead") {
            return member.role === "member";
          }

          // Admins can assign to anyone except themselves
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
                role: member.role,
              }
            : null;
        })
    );

    return assignableMembers.filter(Boolean);
  },
});

/**
 * Check if a user can manage permissions for a specific variable
 */
export const canManageVariablePermissions = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      return { canManage: false, reason: "Variable not found" };
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      return { canManage: false, reason: "Project not found" };
    }

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      return {
        canManage: false,
        reason: "User is not a member of the organization",
      };
    }

    if (membership.role !== "admin" && membership.role !== "team_lead") {
      return {
        canManage: false,
        reason: "Only admins and team leads can manage variable permissions",
      };
    }

    return {
      canManage: true,
      role: membership.role,
      // Team leads can only grant read/write, not admin
      allowedPermissions:
        membership.role === "team_lead"
          ? ["read", "write"]
          : ["read", "write", "admin"],
    };
  },
});

export const getUsersWithProjectAccess = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const userPermissions = new Map<
      string,
      { userId: Id<"users">; variables: { key: string; permission: string }[] }
    >();

    for (const variable of variables) {
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const perm of permissions) {
        const userIdStr = perm.userId.toString();
        if (!userPermissions.has(userIdStr)) {
          userPermissions.set(userIdStr, {
            userId: perm.userId,
            variables: [],
          });
        }
        userPermissions.get(userIdStr)!.variables.push({
          key: variable.key,
          permission: perm.permission,
        });
      }
    }

    const result = await Promise.all(
      Array.from(userPermissions.values()).map(async (entry) => {
        const user = await ctx.db.get(entry.userId);
        return {
          user: user
            ? { _id: user._id, name: user.name, email: user.email }
            : null,
          variables: entry.variables,
          totalVariables: entry.variables.length,
        };
      })
    );

    return result.filter((r) => r.user !== null);
  },
});

// ==========================================
// MUTATIONS
// ==========================================

export const grant = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
    permission: v.union(
      v.literal("read"),
      v.literal("write"),
      v.literal("admin")
    ),
    grantedBy: v.id("users"),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Get variable and project first
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Check if the granter has permission to manage variable permissions
    const granterMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.grantedBy)
      )
      .first();

    if (!granterMembership) {
      throw new Error(
        "Not authorized: User is not a member of the organization"
      );
    }

    // Only admins and team leads can manage permissions
    if (
      granterMembership.role !== "admin" &&
      granterMembership.role !== "team_lead"
    ) {
      throw new Error(
        "Only admins and team leads can manage variable permissions"
      );
    }

    // Team leads can only grant read/write permissions, not admin
    if (granterMembership.role === "team_lead" && args.permission === "admin") {
      throw new Error("Team leads can only grant read or write permissions");
    }

    // Validate target user is part of the org
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!targetMembership) {
      throw new Error("Target user is not a member of the organization");
    }

    // Team leads can only grant permissions to members, not to other team leads or admins
    if (granterMembership.role === "team_lead") {
      const targetRoleLevel = ROLE_HIERARCHY[targetMembership.role] ?? 0;
      const granterRoleLevel = ROLE_HIERARCHY[granterMembership.role] ?? 0;

      if (targetRoleLevel >= granterRoleLevel) {
        throw new Error("Team leads can only manage permissions for members");
      }
    }

    const existingPermission = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable_and_user", (q) =>
        q.eq("variableId", args.variableId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (existingPermission) {
      throw new Error(
        "User already has an active permission for this variable"
      );
    }

    const permissionId = await ctx.db.insert("variablePermissions", {
      variableId: args.variableId,
      userId: args.userId,
      permission: args.permission,
      grantedBy: args.grantedBy,
      grantedAt: now,
      expiresAt: args.expiresAt,
      isActive: true,
    });

    // Get target user details for audit log
    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.grantedBy,
      action: "permission.granted",
      details: JSON.stringify({
        grantedTo: args.userId,
        grantedToEmail: targetUser?.email,
        permission: args.permission,
        expiresAt: args.expiresAt,
        variableKey: variable.key,
      }),
      createdAt: now,
    });

    return permissionId;
  },
});

export const update = mutation({
  args: {
    permissionId: v.id("variablePermissions"),
    permission: v.optional(
      v.union(v.literal("read"), v.literal("write"), v.literal("admin"))
    ),
    expiresAt: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingPerm = await ctx.db.get(args.permissionId);
    if (!existingPerm) {
      throw new Error("Permission not found");
    }

    if (!existingPerm.isActive) {
      throw new Error("Cannot update an inactive permission");
    }

    // Check if the updater has permission to manage variable permissions
    const authCheck = await checkCanManagePermissions(
      ctx,
      existingPerm.variableId,
      args.updatedBy
    );
    if (!authCheck.canManage) {
      throw new Error(
        authCheck.reason ?? "Not authorized to manage permissions"
      );
    }

    // Team leads cannot update to admin permission level
    if (
      authCheck.membership?.role === "team_lead" &&
      args.permission === "admin"
    ) {
      throw new Error("Team leads can only grant read or write permissions");
    }

    const variable = await ctx.db.get(existingPerm.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Team leads can only update permissions for members
    if (authCheck.membership?.role === "team_lead") {
      const targetMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", project.organizationId)
            .eq("userId", existingPerm.userId)
        )
        .first();

      if (targetMembership) {
        const targetRoleLevel = ROLE_HIERARCHY[targetMembership.role] ?? 0;
        const updaterRoleLevel = ROLE_HIERARCHY[authCheck.membership.role] ?? 0;

        if (targetRoleLevel >= updaterRoleLevel) {
          throw new Error("Team leads can only manage permissions for members");
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (args.permission !== undefined) updateData.permission = args.permission;
    if (args.expiresAt !== undefined) updateData.expiresAt = args.expiresAt;

    await ctx.db.patch(args.permissionId, updateData);

    // Get target user details for audit log
    const targetUser = await ctx.db.get(existingPerm.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: existingPerm.variableId,
      userId: args.updatedBy,
      action: "permission.updated",
      details: JSON.stringify({
        targetUser: existingPerm.userId,
        targetUserEmail: targetUser?.email,
        oldPermission: existingPerm.permission,
        newPermission: args.permission ?? existingPerm.permission,
        variableKey: variable.key,
      }),
      createdAt: now,
    });

    return args.permissionId;
  },
});

export const revoke = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Check if the revoker has permission to manage variable permissions
    const revokerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.revokedBy)
      )
      .first();

    if (!revokerMembership) {
      throw new Error(
        "Not authorized: User is not a member of the organization"
      );
    }

    if (
      revokerMembership.role !== "admin" &&
      revokerMembership.role !== "team_lead"
    ) {
      throw new Error(
        "Only admins and team leads can manage variable permissions"
      );
    }

    const permission = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable_and_user", (q) =>
        q.eq("variableId", args.variableId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();

    if (!permission) {
      throw new Error("No active permission found");
    }

    // Team leads can only revoke permissions they can manage (members only)
    if (revokerMembership.role === "team_lead") {
      const targetMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q
            .eq("organizationId", project.organizationId)
            .eq("userId", args.userId)
        )
        .first();

      if (targetMembership) {
        const targetRoleLevel = ROLE_HIERARCHY[targetMembership.role] ?? 0;
        const revokerRoleLevel = ROLE_HIERARCHY[revokerMembership.role] ?? 0;

        if (targetRoleLevel >= revokerRoleLevel) {
          throw new Error("Team leads can only manage permissions for members");
        }
      }
    }

    await ctx.db.patch(permission._id, {
      isActive: false,
      revokedAt: now,
      revokedBy: args.revokedBy,
    });

    // Get target user details for audit log
    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.revokedBy,
      action: "permission.revoked",
      details: JSON.stringify({
        revokedFrom: args.userId,
        revokedFromEmail: targetUser?.email,
        permission: permission.permission,
        variableKey: variable.key,
      }),
      createdAt: now,
    });

    return permission._id;
  },
});

export const bulkGrant = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    userIds: v.array(v.id("users")),
    permission: v.union(
      v.literal("read"),
      v.literal("write"),
      v.literal("admin")
    ),
    grantedBy: v.id("users"),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization check - only admins and team leads can bulk grant
    const authCheck = await checkCanManagePermissions(
      ctx,
      args.variableId,
      args.grantedBy
    );
    if (!authCheck.canManage) {
      throw new Error(
        authCheck.reason ?? "Not authorized to manage permissions"
      );
    }

    // Team leads cannot grant admin permission
    if (
      authCheck.membership?.role === "team_lead" &&
      args.permission === "admin"
    ) {
      throw new Error("Team leads can only grant read or write permissions");
    }

    const grantedIds = [];
    const skippedIds = [];

    for (const userId of args.userIds) {
      const existing = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable_and_user", (q) =>
          q.eq("variableId", args.variableId).eq("userId", userId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .first();

      if (existing) {
        skippedIds.push(userId);
        continue;
      }

      const permissionId = await ctx.db.insert("variablePermissions", {
        variableId: args.variableId,
        userId,
        permission: args.permission,
        grantedBy: args.grantedBy,
        grantedAt: now,
        expiresAt: args.expiresAt,
        isActive: true,
      });

      grantedIds.push(permissionId);
    }

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.grantedBy,
      action: "permission.granted",
      details: JSON.stringify({
        bulkGrant: true,
        permission: args.permission,
        grantedCount: grantedIds.length,
        skippedCount: skippedIds.length,
      }),
      createdAt: now,
    });

    return { granted: grantedIds, skipped: skippedIds };
  },
});

export const bulkRevokeForUser = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization check - only admins and team leads can bulk revoke
    const revokerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.revokedBy)
      )
      .first();

    if (!revokerMembership) {
      throw new Error(
        "Not authorized: User is not a member of the organization"
      );
    }

    if (
      revokerMembership.role !== "admin" &&
      revokerMembership.role !== "team_lead"
    ) {
      throw new Error(
        "Only admins and team leads can manage variable permissions"
      );
    }

    // Get target user's membership to check role hierarchy
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    // Team leads can only revoke permissions for members
    if (revokerMembership.role === "team_lead" && targetMembership) {
      const targetRoleLevel = ROLE_HIERARCHY[targetMembership.role] ?? 0;
      const revokerRoleLevel = ROLE_HIERARCHY[revokerMembership.role] ?? 0;

      if (targetRoleLevel >= revokerRoleLevel) {
        throw new Error("Team leads can only manage permissions for members");
      }
    }

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let revokedCount = 0;

    for (const variable of variables) {
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable_and_user", (q) =>
          q.eq("variableId", variable._id).eq("userId", args.userId)
        )
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.revokedBy,
        });
        revokedCount++;
      }
    }

    // Get target user details for audit log
    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.revokedBy,
      action: "permission.revoked",
      details: JSON.stringify({
        bulkRevoke: true,
        revokedFrom: args.userId,
        revokedFromEmail: targetUser?.email,
        count: revokedCount,
      }),
      createdAt: now,
    });

    return { revokedCount };
  },
});

export const revokeAllForVariable = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    revokedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Authorization check - only admins can revoke all permissions
    // (This is a destructive operation, so we limit it to admins only)
    const revokerMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.revokedBy)
      )
      .first();

    if (!revokerMembership) {
      throw new Error(
        "Not authorized: User is not a member of the organization"
      );
    }

    // Only admins can revoke all permissions at once (destructive operation)
    if (revokerMembership.role !== "admin") {
      throw new Error("Only admins can revoke all permissions for a variable");
    }

    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const perm of permissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
        revokedBy: args.revokedBy,
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: args.revokedBy,
      action: "permission.revoked",
      details: JSON.stringify({
        bulkRevoke: true,
        allPermissions: true,
        count: permissions.length,
        variableKey: variable.key,
      }),
      createdAt: now,
    });

    return { revokedCount: permissions.length };
  },
});

/**
 * Internal mutation to cleanup expired permissions
 * Should be called by a scheduled job, not directly by clients
 */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const allPermissions = await ctx.db
      .query("variablePermissions")
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    const expiredPermissions = allPermissions.filter(
      (p) => p.expiresAt && p.expiresAt < now
    );

    for (const perm of expiredPermissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
      });
    }

    return { cleanedUp: expiredPermissions.length };
  },
});
