import { v } from "convex/values";
import { query, MutationCtx, QueryCtx } from "../../../_generated/server";
import { Id } from "../../../_generated/dataModel";
import { batchGetUsers, userInfo } from "../../../lib/users";
import {
  assertProjectAction,
  filterMembersStrictlyBelow,
  normalizeOrgRole,
  type OrgRole,
} from "../../../lib/authz";

/**
 * Per-account permission grants — the shared-account analog of
 * convex/permissions.ts (variablePermissions). Same authorization contract:
 * ALL mutations funnel through
 * assertProjectAction(ctx, actor, projectId, "project:manage_account_permissions")
 * — owners bypass assignment; project managers and team leads must be assigned
 * to the account's project; developers can never manage grants.
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

/** Grantable permission levels for accounts. Only read/write exist. */
const GRANTABLE_PERMISSIONS = ["read", "write"] as const;

/**
 * Check if a user can manage permissions for an account (non-throwing).
 * Backed by the exact same path the mutations enforce, so frontend answers
 * always match backend enforcement.
 */
async function checkCanManagePermissions(
  ctx: MutationCtx | QueryCtx,
  accountId: Id<"projectAccounts">,
  userId: Id<"users">
): Promise<PermissionCheckResult> {
  const account = await ctx.db.get(accountId);
  if (!account || account.deletedAt) {
    return { canManage: false, reason: "Account not found" };
  }

  const project = await ctx.db.get(account.projectId);
  if (!project || project.deletedAt) {
    return { canManage: false, reason: "Project not found" };
  }

  try {
    const { orgRole } = await assertProjectAction(
      ctx,
      userId,
      account.projectId,
      "project:manage_account_permissions"
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
    console.error("accountPermissions.checkCanManagePermissions.denied", {
      accountId,
      userId,
      projectId: account.projectId,
      error: String(err),
    });
    return {
      canManage: false,
      reason:
        "Only owners, project managers, and team leads assigned to the project can manage account permissions",
    };
  }
}

// Full accountPermissions doc shape, for `returns` validators that spread docs
const permissionDocFields = {
  _id: v.id("accountPermissions"),
  _creationTime: v.number(),
  accountId: v.id("projectAccounts"),
  userId: v.id("users"),
  permission: v.union(v.literal("read"), v.literal("write")),
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

export const getForAccount = query({
  args: { accountId: v.id("projectAccounts") },
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
      .query("accountPermissions")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
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

/**
 * Get org members who can be granted a permission on an account.
 *
 * Eligibility mirrors the mutation target rule exactly: the member must be
 * strictly below the requester's role level (owners can grant to anyone),
 * must not be the requester, and must not already hold an active grant on the
 * account. Members do NOT need a project assignment — unassigned members
 * receive read-only "viewer" access via their grant.
 */
export const getAssignableMembers = query({
  args: {
    accountId: v.id("projectAccounts"),
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
    const account = await ctx.db.get(args.accountId);
    if (!account || account.deletedAt) {
      return [];
    }

    const project = await ctx.db.get(account.projectId);
    if (!project || project.deletedAt) {
      return [];
    }

    // Requester must be able to manage permissions on this account
    let requesterRole: OrgRole;
    try {
      const auth = await assertProjectAction(
        ctx,
        args.requestingUserId,
        account.projectId,
        "project:manage_account_permissions"
      );
      requesterRole = auth.orgRole;
    } catch (err) {
      console.error("accountPermissions.getAssignableMembers.denied", {
        accountId: args.accountId,
        requestingUserId: args.requestingUserId,
        projectId: account.projectId,
        error: String(err),
      });
      return [];
    }

    // All org members are candidates — grants can target users who are not
    // assigned to the project (per-account viewer sharing)
    const orgMembers = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    // Existing active grants for this account
    const existingPermissions = (
      await ctx.db
        .query("accountPermissions")
        .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
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
        if (member.userId === args.requestingUserId) return false;
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
 * Check if a user can manage permissions for a specific account.
 * Backed by the same authorization path the mutations enforce.
 */
export const canManageAccountPermissions = query({
  args: {
    accountId: v.id("projectAccounts"),
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
      args.accountId,
      args.userId
    );

    if (!check.canManage || !check.membership) {
      return { canManage: false, reason: check.reason };
    }

    return {
      canManage: true,
      role: check.membership.role,
      allowedPermissions: [...GRANTABLE_PERMISSIONS],
    };
  },
});
