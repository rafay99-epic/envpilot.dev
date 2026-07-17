import { v } from "convex/values";
import { query, MutationCtx, QueryCtx } from "../../../_generated/server";
import { Doc, Id } from "../../../_generated/dataModel";
import { requireAuthedUser } from "../../../lib/identity";
import { batchGetUsers, userInfo } from "../../../lib/users";
import {
  assertProjectAction,
  filterMembersStrictlyBelow,
  normalizeOrgRole,
  type OrgRole,
} from "../../../lib/authz";

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

/**
 * Cap for getUsersWithProjectAccess's per-project variable read — mirrors the
 * 500-per-project convention used throughout variables.ts (e.g. listWithAccess).
 */
const GET_USERS_VARIABLES_CAP = 500;

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
  } catch (err) {
    console.error("permissions.checkCanManagePermissions.denied", {
      variableId,
      userId,
      projectId: variable.projectId,
      error: String(err),
    });
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

// Registry-driven role slugs — open string set (see lib/roleCompat.ts).
const orgRoleValidator = v.string();

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

const getForUserReturns = v.array(
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
);

async function getForUserCore(ctx: QueryCtx, userId: Id<"users">) {
  const permissions = await ctx.db
    .query("variablePermissions")
    .withIndex("by_user_active", (q) =>
      q.eq("userId", userId).eq("isActive", true)
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
    .filter((entry) => entry !== null);
}

export const getForUser = query({
  args: {},
  returns: getForUserReturns,
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return getForUserCore(ctx, actor._id);
  },
});

export const checkPermission = query({
  args: {
    variableId: v.id("environmentVariables"),
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
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const permission = await findActiveGrant(ctx, args.variableId, actor._id);

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
    const actor = await requireAuthedUser(ctx);

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
        actor._id,
        variable.projectId,
        "project:manage_permissions"
      );
      requesterRole = auth.orgRole;
    } catch (err) {
      console.error("permissions.getAssignableMembers.denied", {
        variableId: args.variableId,
        requestingUserId: actor._id,
        projectId: variable.projectId,
        error: String(err),
      });
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

    // Owner-class grants to anyone; everyone else only strictly below their
    // registry-resolved level (custom roles rank correctly).
    const eligibleMembers = await filterMembersStrictlyBelow(
      ctx,
      requesterRole,
      orgMembers.filter((member) => {
        if (member.userId === actor._id) return false;
        if (usersWithPermissions.has(member.userId.toString())) return false;
        return true;
      })
    );

    // Batch fetch every eligible user in one pass instead of one ctx.db.get
    // per member (getAssignableMembers N+1).
    const userMap = await batchGetUsers(
      ctx,
      eligibleMembers.map((member) => member.userId)
    );

    const assignableMembers = eligibleMembers.map((member) => {
      const user = userMap.get(member.userId.toString());
      return user
        ? {
            _id: user._id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            role: normalizeOrgRole(member.role),
            isAssignedToProject: assignedUserIds.has(member.userId.toString()),
          }
        : null;
    });

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
    const actor = await requireAuthedUser(ctx);

    const check = await checkCanManagePermissions(
      ctx,
      args.variableId,
      actor._id
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
    // Capped (mirrors the perProjectLimit convention in variables.ts) instead
    // of an unbounded collect — variablePermissions has no project-scoped
    // index (see below), so this bounds the fan-out width too. Projects past
    // this cap will only show access for their first GET_USERS_VARIABLES_CAP
    // variables; that mirrors the same tradeoff variables.ts's other
    // per-project list queries already accept.
    const variables = (
      await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .take(GET_USERS_VARIABLES_CAP)
    ).filter((variable) => !variable.deletedAt);

    // variablePermissions has no project-scoped index (it would require
    // denormalizing projectId onto every grant row plus a backfill migration
    // — out of scope for this pass; see convex/permissions.ts module notes),
    // so one indexed read per variable is the minimum. Run them concurrently
    // (instead of awaiting in a sequential loop) and fold into the user map in
    // a single pass. Promise.all preserves order, so the resulting user
    // ordering matches the old loop.
    const permsPerVariable = await Promise.all(
      variables.map(async (variable) => ({
        variable,
        permissions: (
          await ctx.db
            .query("variablePermissions")
            .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
            .collect()
        ).filter((p) => p.isActive),
      }))
    );

    const userPermissions = new Map<
      string,
      { userId: Id<"users">; variables: { key: string; permission: string }[] }
    >();

    for (const { variable, permissions } of permsPerVariable) {
      for (const perm of permissions) {
        const userIdStr = perm.userId.toString();
        let entry = userPermissions.get(userIdStr);
        if (!entry) {
          entry = { userId: perm.userId, variables: [] };
          userPermissions.set(userIdStr, entry);
        }
        entry.variables.push({
          key: variable.key,
          permission: perm.permission,
        });
      }
    }

    // Resolve distinct users once (deduped) instead of a get() per entry.
    const entries = Array.from(userPermissions.values());
    const userMap = await batchGetUsers(
      ctx,
      entries.map((e) => e.userId)
    );

    return entries
      .map((entry) => {
        const user = userMap.get(entry.userId.toString());
        return {
          user: userInfo(user),
          variables: entry.variables,
          totalVariables: entry.variables.length,
        };
      })
      .filter((r) => r.user !== null);
  },
});
