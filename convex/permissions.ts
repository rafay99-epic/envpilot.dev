import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { batchGetUsers, userInfo } from "./helpers";
import { isCronPaused } from "./tierLimits";
import { checkBooleanFeature } from "./featureRegistry";
import {
  assertProjectAction,
  assertCanManageUser,
  normalizeOrgRole,
  roleLevel,
  type OrgRole,
} from "./authz";

/**
 * Unified authorization for variable-permission management.
 *
 * ALL mutations in this file authorize through the same path:
 * assertProjectAction(ctx, actor, projectId, "project:manage_permissions")
 * — owners bypass assignment, project managers and team leads must be
 * assigned to the variable's project. Developers can never manage grants.
 */

type PermissionCheckResult = {
  canManage: boolean;
  reason?: string;
  membership?: {
    role: OrgRole;
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  };
};

/** Grantable permission levels. "admin" is legacy — treated as write, never granted. */
const GRANTABLE_PERMISSIONS = ["read", "write"] as const;

function assertGrantablePermission(permission: string): void {
  if (permission === "admin") {
    throw new Error(
      'The "admin" permission level can no longer be granted. Grant "read" or "write" instead.'
    );
  }
}

/**
 * Authorize an actor to manage permissions on a variable's project and
 * resolve the owning organization. Throws on failure.
 */
async function authorizePermissionManager(
  ctx: MutationCtx | QueryCtx,
  actorId: Id<"users">,
  projectId: Id<"projects">
): Promise<{ orgRole: OrgRole; organizationId: Id<"organizations"> }> {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  const { orgRole } = await assertProjectAction(
    ctx,
    actorId,
    projectId,
    "project:manage_permissions"
  );

  return { orgRole, organizationId: project.organizationId };
}

/**
 * Target rule — identical in every mutation:
 * the target must be a member of the same organization, and their normalized
 * role level must be strictly below the actor's. Owners can target anyone.
 *
 * Note: targets do NOT need a project assignment — per-variable grants to
 * unassigned org members are the read-only "viewer sharing" feature
 * (getVariableAccess caps unassigned users at read).
 */
async function assertGrantTarget(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">,
  actorRole: OrgRole,
  targetUserId: Id<"users">,
  action: string
): Promise<void> {
  const targetMembership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", targetUserId)
    )
    .first();

  if (!targetMembership) {
    throw new Error("Target user is not a member of the organization");
  }

  if (actorRole !== "owner") {
    assertCanManageUser(actorRole, targetMembership.role, action);
  }
}

/**
 * Find the target's active grant on a variable (isActive only — expiry is
 * handled by checkPermission / getVariableAccess and the cleanup cron).
 */
async function findActiveGrant(
  ctx: MutationCtx | QueryCtx,
  variableId: Id<"environmentVariables">,
  userId: Id<"users">
): Promise<Doc<"variablePermissions"> | null> {
  const grants = await ctx.db
    .query("variablePermissions")
    .withIndex("by_variable_and_user", (q) =>
      q.eq("variableId", variableId).eq("userId", userId)
    )
    .collect();

  return grants.find((g) => g.isActive) ?? null;
}

/**
 * Check if a user can manage permissions for a variable (non-throwing).
 * Backed by the exact same path the mutations enforce, so frontend answers
 * always match backend enforcement.
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

  try {
    const { orgRole } = await assertProjectAction(
      ctx,
      userId,
      variable.projectId,
      "project:manage_permissions"
    );

    return {
      canManage: true,
      membership: {
        role: orgRole,
        organizationId: project.organizationId,
        userId,
      },
    };
  } catch {
    return {
      canManage: false,
      reason:
        "Only owners, project managers, and team leads assigned to the project can manage variable permissions",
    };
  }
}

/**
 * Permission Queries and Mutations
 */

// Full variablePermissions doc shape, for `returns` validators that spread docs
const permissionDocFields = {
  _id: v.id("variablePermissions"),
  _creationTime: v.number(),
  variableId: v.id("environmentVariables"),
  userId: v.id("users"),
  permission: v.union(
    v.literal("read"),
    v.literal("write"),
    v.literal("admin")
  ),
  grantedBy: v.id("users"),
  grantedAt: v.number(),
  expiresAt: v.optional(v.number()),
  isActive: v.boolean(),
  revokedAt: v.optional(v.number()),
  revokedBy: v.optional(v.id("users")),
};

const userInfoValidator = v.union(
  v.object({
    _id: v.id("users"),
    name: v.optional(v.string()),
    email: v.string(),
  }),
  v.null()
);

const orgRoleValidator = v.union(
  v.literal("owner"),
  v.literal("project_manager"),
  v.literal("team_lead"),
  v.literal("developer")
);

// ==========================================
// QUERIES
// ==========================================

export const getForVariable = query({
  args: { variableId: v.id("environmentVariables") },
  returns: v.array(
    v.object({
      ...permissionDocFields,
      user: userInfoValidator,
      grantedByUser: v.union(
        v.object({ name: v.optional(v.string()), email: v.string() }),
        v.null()
      ),
      revokedByUser: v.union(
        v.object({ name: v.optional(v.string()), email: v.string() }),
        v.null()
      ),
    })
  ),
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
  returns: v.array(
    v.object({
      ...permissionDocFields,
      variable: v.object({
        _id: v.id("environmentVariables"),
        key: v.string(),
        description: v.optional(v.string()),
      }),
      project: v.union(
        v.object({
          _id: v.id("projects"),
          name: v.string(),
          slug: v.string(),
        }),
        v.null()
      ),
    })
  ),
  handler: async (ctx, args) => {
    const permissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    // Batch fetch variables
    const varIds = [
      ...new Set(permissions.map((p) => p.variableId.toString())),
    ];
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
      .filter((entry) => entry !== null);
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
  returns: v.object({
    hasPermission: v.boolean(),
    reason: v.optional(v.string()),
    grantedPermission: v.optional(
      v.union(v.literal("read"), v.literal("write"), v.literal("admin"))
    ),
    expiresAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const permission = await findActiveGrant(ctx, args.variableId, args.userId);

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
  returns: v.array(
    v.object({
      ...permissionDocFields,
      userName: v.string(),
      grantedByName: v.string(),
    })
  ),
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
 * Get org members who can be granted a permission on a variable.
 *
 * Eligibility mirrors the mutation target rule exactly: the member must be
 * strictly below the requester's role level (owners can grant to anyone),
 * must not be the requester, and must not already hold an active grant on
 * the variable. Members do NOT need a project assignment — unassigned
 * members receive read-only "viewer" access via their grant.
 */
export const getAssignableMembers = query({
  args: {
    variableId: v.id("environmentVariables"),
    requestingUserId: v.id("users"),
  },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      email: v.string(),
      name: v.optional(v.string()),
      avatarUrl: v.optional(v.string()),
      role: orgRoleValidator,
      isAssignedToProject: v.boolean(),
    })
  ),
  handler: async (ctx, args) => {
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      return [];
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Requester must be able to manage permissions on this variable
    let requesterRole: OrgRole;
    try {
      const auth = await assertProjectAction(
        ctx,
        args.requestingUserId,
        variable.projectId,
        "project:manage_permissions"
      );
      requesterRole = auth.orgRole;
    } catch {
      return [];
    }

    // All org members are candidates — grants can target users who are not
    // assigned to the project (per-variable viewer sharing)
    const orgMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    // Existing active grants for this variable
    const existingPermissions = (
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
        .collect()
    ).filter((p) => p.isActive);

    const usersWithPermissions = new Set(
      existingPermissions.map((p) => p.userId.toString())
    );

    // Project assignments, so the UI can distinguish assigned members from
    // grant-only viewers
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .collect();
    const assignedUserIds = new Set(
      projectMembers.map((pm) => pm.userId.toString())
    );

    const eligibleMembers = orgMembers.filter((member) => {
      if (member.userId === args.requestingUserId) return false;
      if (usersWithPermissions.has(member.userId.toString())) return false;
      // Owners can grant to anyone; everyone else only strictly below their level
      if (
        requesterRole !== "owner" &&
        roleLevel(member.role) >= roleLevel(requesterRole)
      ) {
        return false;
      }
      return true;
    });

    const assignableMembers = await Promise.all(
      eligibleMembers.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return user
          ? {
              _id: user._id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
              role: normalizeOrgRole(member.role),
              isAssignedToProject: assignedUserIds.has(
                member.userId.toString()
              ),
            }
          : null;
      })
    );

    return assignableMembers.filter((member) => member !== null);
  },
});

/**
 * Check if a user can manage permissions for a specific variable.
 * Backed by the same authorization path the mutations enforce.
 */
export const canManageVariablePermissions = query({
  args: {
    variableId: v.id("environmentVariables"),
    userId: v.id("users"),
  },
  returns: v.object({
    canManage: v.boolean(),
    reason: v.optional(v.string()),
    role: v.optional(orgRoleValidator),
    allowedPermissions: v.optional(
      v.array(v.union(v.literal("read"), v.literal("write")))
    ),
  }),
  handler: async (ctx, args) => {
    const check = await checkCanManagePermissions(
      ctx,
      args.variableId,
      args.userId
    );

    if (!check.canManage || !check.membership) {
      return { canManage: false, reason: check.reason };
    }

    return {
      canManage: true,
      role: check.membership.role,
      // "admin" is legacy and no longer grantable by anyone
      allowedPermissions: [...GRANTABLE_PERMISSIONS],
    };
  },
});

export const getUsersWithProjectAccess = query({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      user: userInfoValidator,
      variables: v.array(v.object({ key: v.string(), permission: v.string() })),
      totalVariables: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const variables = (
      await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect()
    ).filter((variable) => !variable.deletedAt);

    const userPermissions = new Map<
      string,
      { userId: Id<"users">; variables: { key: string; permission: string }[] }
    >();

    for (const variable of variables) {
      const permissions = (
        await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
          .collect()
      ).filter((p) => p.isActive);

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
  returns: v.id("variablePermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the variable's project
    const { orgRole, organizationId } = await authorizePermissionManager(
      ctx,
      args.grantedBy,
      variable.projectId
    );

    // Only read/write are grantable going forward
    assertGrantablePermission(args.permission);

    // Check granular_permissions feature gate
    const permCheck = await checkBooleanFeature(
      ctx.db,
      organizationId,
      "granular_permissions"
    );
    if (!permCheck.allowed) {
      throw new Error(
        "Granular permissions are not available on your current tier."
      );
    }

    // Target rule: org member, strictly below the actor (owners exempt)
    await assertGrantTarget(
      ctx,
      organizationId,
      orgRole,
      args.userId,
      "grant variable permissions"
    );

    const existingPermission = await findActiveGrant(
      ctx,
      args.variableId,
      args.userId
    );

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
      organizationId,
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
  returns: v.id("variablePermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingPerm = await ctx.db.get(args.permissionId);
    if (!existingPerm) {
      throw new Error("Permission not found");
    }

    if (!existingPerm.isActive) {
      throw new Error("Cannot update an inactive permission");
    }

    const variable = await ctx.db.get(existingPerm.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the variable's project
    const { orgRole, organizationId } = await authorizePermissionManager(
      ctx,
      args.updatedBy,
      variable.projectId
    );

    // Only read/write are grantable going forward
    if (args.permission !== undefined) {
      assertGrantablePermission(args.permission);
    }

    // Check granular_permissions feature gate
    const updatePermCheck = await checkBooleanFeature(
      ctx.db,
      organizationId,
      "granular_permissions"
    );
    if (!updatePermCheck.allowed) {
      throw new Error(
        "Granular permissions are not available on your current tier."
      );
    }

    // Target rule: org member, strictly below the actor (owners exempt)
    await assertGrantTarget(
      ctx,
      organizationId,
      orgRole,
      existingPerm.userId,
      "update variable permissions"
    );

    const updateData: Record<string, unknown> = {};
    if (args.permission !== undefined) updateData.permission = args.permission;
    if (args.expiresAt !== undefined) updateData.expiresAt = args.expiresAt;

    await ctx.db.patch(args.permissionId, updateData);

    // Get target user details for audit log
    const targetUser = await ctx.db.get(existingPerm.userId);

    await ctx.db.insert("auditLogs", {
      organizationId,
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
  returns: v.id("variablePermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the variable's project
    const { orgRole, organizationId } = await authorizePermissionManager(
      ctx,
      args.revokedBy,
      variable.projectId
    );

    const permission = await findActiveGrant(ctx, args.variableId, args.userId);

    if (!permission) {
      throw new Error("No active permission found");
    }

    // Target rule: org member, strictly below the actor (owners exempt)
    await assertGrantTarget(
      ctx,
      organizationId,
      orgRole,
      args.userId,
      "revoke variable permissions"
    );

    await ctx.db.patch(permission._id, {
      isActive: false,
      revokedAt: now,
      revokedBy: args.revokedBy,
    });

    // Get target user details for audit log
    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId,
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
  returns: v.object({
    granted: v.array(v.id("variablePermissions")),
    skipped: v.array(v.id("users")),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the variable's project
    const { orgRole, organizationId } = await authorizePermissionManager(
      ctx,
      args.grantedBy,
      variable.projectId
    );

    // Only read/write are grantable going forward
    assertGrantablePermission(args.permission);

    // Check granular_permissions feature gate
    const bulkPermCheck = await checkBooleanFeature(
      ctx.db,
      organizationId,
      "granular_permissions"
    );
    if (!bulkPermCheck.allowed) {
      throw new Error(
        "Granular permissions are not available on your current tier."
      );
    }

    const grantedIds: Id<"variablePermissions">[] = [];
    const skippedIds: Id<"users">[] = [];

    for (const userId of args.userIds) {
      // Target rule — same as single grant; ineligible targets are skipped
      // instead of failing the whole batch
      const targetMembership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", organizationId).eq("userId", userId)
        )
        .first();

      if (!targetMembership) {
        skippedIds.push(userId);
        continue;
      }

      if (orgRole !== "owner") {
        try {
          assertCanManageUser(
            orgRole,
            targetMembership.role,
            "grant variable permissions"
          );
        } catch {
          skippedIds.push(userId);
          continue;
        }
      }

      const existing = await findActiveGrant(ctx, args.variableId, userId);

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
      organizationId,
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
  returns: v.object({ revokedCount: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the project
    const { orgRole } = await assertProjectAction(
      ctx,
      args.revokedBy,
      args.projectId,
      "project:manage_permissions"
    );

    // Target rule: org member, strictly below the actor (owners exempt)
    await assertGrantTarget(
      ctx,
      project.organizationId,
      orgRole,
      args.userId,
      "revoke variable permissions"
    );

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    let revokedCount = 0;

    for (const variable of variables) {
      const permissions = (
        await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable_and_user", (q) =>
            q.eq("variableId", variable._id).eq("userId", args.userId)
          )
          .collect()
      ).filter((p) => p.isActive);

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
  returns: v.object({ revokedCount: v.number() }),
  handler: async (ctx, args) => {
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    // Unified authorization, then tightened: this is a destructive operation,
    // so only owners and project managers may revoke everything at once
    const { orgRole, organizationId } = await authorizePermissionManager(
      ctx,
      args.revokedBy,
      variable.projectId
    );

    if (orgRole === "team_lead") {
      throw new Error(
        "Only owners and project managers can revoke all permissions for a variable"
      );
    }

    const permissions = (
      await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
        .collect()
    ).filter((p) => p.isActive);

    for (const perm of permissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
        revokedBy: args.revokedBy,
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId,
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
  returns: v.object({ cleanedUp: v.number() }),
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_permissions")) {
      return { cleanedUp: 0 };
    }

    const now = Date.now();

    const allPermissions = await ctx.db.query("variablePermissions").collect();

    const expiredPermissions = allPermissions.filter(
      (p) => p.isActive && p.expiresAt && p.expiresAt < now
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
