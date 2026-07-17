import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "../../../_generated/server";
import { Doc, Id } from "../../../_generated/dataModel";
import { isCronPaused } from "../../billing/tierLimits";
import { checkBooleanFeature } from "../../featureRegistry/gates";
import { createAuditLog } from "../../../lib/audit";
import {
  assertCanManageUserAsync,
  assertProjectAction,
  bypassesAssignment,
  getRoleProfile,
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

/**
 * Authorize an actor to manage permissions on an account's project and resolve
 * the owning organization. Throws on failure.
 */
async function authorizeAccountGrantManager(
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
    "project:manage_account_permissions"
  );

  return { orgRole, organizationId: project.organizationId };
}

/**
 * Target rule — identical in every mutation: the target must be a member of
 * the same organization, and their normalized role level must be strictly
 * below the actor's. Owners can target anyone.
 *
 * Note: targets do NOT need a project assignment — per-account grants to
 * unassigned org members are the read-only "viewer sharing" feature
 * (getAccountAccess caps unassigned users at read).
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

  // Owner-class actors (org.manage) may grant to anyone, peers included.
  const actorProfile = await getRoleProfile(ctx, actorRole);
  if (!bypassesAssignment(actorProfile)) {
    await assertCanManageUserAsync(
      ctx,
      actorRole,
      targetMembership.role,
      action
    );
  }
}

/**
 * Find the target's active grant on an account (isActive only — expiry is
 * handled by getAccountAccess and the cleanup cron).
 */
async function findActiveGrant(
  ctx: MutationCtx | QueryCtx,
  accountId: Id<"projectAccounts">,
  userId: Id<"users">
): Promise<Doc<"accountPermissions"> | null> {
  const grants = await ctx.db
    .query("accountPermissions")
    .withIndex("by_account_and_user", (q) =>
      q.eq("accountId", accountId).eq("userId", userId)
    )
    .collect();

  return grants.find((g) => g.isActive) ?? null;
}

// ==========================================
// MUTATIONS
// ==========================================

export const grant = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    userId: v.id("users"),
    permission: v.union(v.literal("read"), v.literal("write")),
    grantedBy: v.id("users"),
    expiresAt: v.optional(v.number()),
  },
  returns: v.id("accountPermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const account = await ctx.db.get(args.accountId);
    if (!account || account.deletedAt) {
      throw new Error("Account not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the account's project
    const { orgRole, organizationId } = await authorizeAccountGrantManager(
      ctx,
      args.grantedBy,
      account.projectId
    );

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
      "grant account permissions"
    );

    const existingPermission = await findActiveGrant(
      ctx,
      args.accountId,
      args.userId
    );

    if (existingPermission) {
      throw new Error("User already has an active permission for this account");
    }

    const permissionId = await ctx.db.insert("accountPermissions", {
      accountId: args.accountId,
      userId: args.userId,
      permission: args.permission,
      grantedBy: args.grantedBy,
      grantedAt: now,
      expiresAt: args.expiresAt,
      isActive: true,
    });

    const targetUser = await ctx.db.get(args.userId);

    await createAuditLog(ctx, {
      organizationId,
      projectId: account.projectId,
      userId: args.grantedBy,
      action: "account.permission_granted",
      details: {
        accountId: args.accountId,
        accountName: account.name,
        grantedTo: args.userId,
        grantedToEmail: targetUser?.email,
        permission: args.permission,
        expiresAt: args.expiresAt,
      },
      involvesSensitiveData: true,
      resourceType: "account",
    });

    return permissionId;
  },
});

export const update = mutation({
  args: {
    permissionId: v.id("accountPermissions"),
    permission: v.optional(v.union(v.literal("read"), v.literal("write"))),
    expiresAt: v.optional(v.number()),
    updatedBy: v.id("users"),
  },
  returns: v.id("accountPermissions"),
  handler: async (ctx, args) => {
    const existingPerm = await ctx.db.get(args.permissionId);
    if (!existingPerm) {
      throw new Error("Permission not found");
    }

    if (!existingPerm.isActive) {
      throw new Error("Cannot update an inactive permission");
    }

    const account = await ctx.db.get(existingPerm.accountId);
    if (!account || account.deletedAt) {
      throw new Error("Account not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the account's project
    const { orgRole, organizationId } = await authorizeAccountGrantManager(
      ctx,
      args.updatedBy,
      account.projectId
    );

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
      "update account permissions"
    );

    const updateData: Record<string, unknown> = {};
    if (args.permission !== undefined) updateData.permission = args.permission;
    if (args.expiresAt !== undefined) updateData.expiresAt = args.expiresAt;

    await ctx.db.patch(args.permissionId, updateData);

    const targetUser = await ctx.db.get(existingPerm.userId);

    await createAuditLog(ctx, {
      organizationId,
      projectId: account.projectId,
      userId: args.updatedBy,
      action: "account.permission_updated",
      details: {
        accountId: existingPerm.accountId,
        accountName: account.name,
        targetUser: existingPerm.userId,
        targetUserEmail: targetUser?.email,
        oldPermission: existingPerm.permission,
        newPermission: args.permission ?? existingPerm.permission,
      },
      involvesSensitiveData: true,
      resourceType: "account",
    });

    return args.permissionId;
  },
});

export const revoke = mutation({
  args: {
    accountId: v.id("projectAccounts"),
    userId: v.id("users"),
    revokedBy: v.id("users"),
  },
  returns: v.id("accountPermissions"),
  handler: async (ctx, args) => {
    const now = Date.now();

    const account = await ctx.db.get(args.accountId);
    if (!account || account.deletedAt) {
      throw new Error("Account not found");
    }

    // Unified authorization: owner (bypass), or project manager / team lead
    // assigned to the account's project
    const { orgRole, organizationId } = await authorizeAccountGrantManager(
      ctx,
      args.revokedBy,
      account.projectId
    );

    const permission = await findActiveGrant(ctx, args.accountId, args.userId);

    if (!permission) {
      throw new Error("No active permission found");
    }

    // Target rule: org member, strictly below the actor (owners exempt)
    await assertGrantTarget(
      ctx,
      organizationId,
      orgRole,
      args.userId,
      "revoke account permissions"
    );

    await ctx.db.patch(permission._id, {
      isActive: false,
      revokedAt: now,
      revokedBy: args.revokedBy,
    });

    const targetUser = await ctx.db.get(args.userId);

    await createAuditLog(ctx, {
      organizationId,
      projectId: account.projectId,
      userId: args.revokedBy,
      action: "account.permission_revoked",
      details: {
        accountId: args.accountId,
        accountName: account.name,
        revokedFrom: args.userId,
        revokedFromEmail: targetUser?.email,
        permission: permission.permission,
      },
      involvesSensitiveData: true,
      resourceType: "account",
    });

    return permission._id;
  },
});

/**
 * Runs are capped per invocation — see permissions.CLEANUP_BATCH_SIZE for the
 * rationale (cheap per-row work here, unlike vaultGc's external calls).
 */
const CLEANUP_BATCH_SIZE = 1000;

/**
 * Internal mutation to cleanup expired account permissions.
 * Registered as a daily cron alongside the variablePermissions cleanup.
 *
 * There is no "account.permission_expired" audit action, so expired grants are
 * simply deactivated (parity: the variable cron audits, but the account action
 * set intentionally omits an expired-permission event).
 */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ cleanedUp: v.number() }),
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_account_permissions")) {
      return { cleanedUp: 0 };
    }

    const now = Date.now();

    // Bounded by the by_active_and_expires index (mirrors
    // permissions.cleanupExpired's variablePermissions fix — see that file
    // for the full ordering rationale): permanent grants (no expiry) are
    // never read at all, since expiresAt's undefined sorts below the gt(0)
    // floor. Capped at CLEANUP_BATCH_SIZE per run.
    const expiredPermissions = await ctx.db
      .query("accountPermissions")
      .withIndex("by_active_and_expires", (q) =>
        q.eq("isActive", true).gt("expiresAt", 0).lte("expiresAt", now)
      )
      .take(CLEANUP_BATCH_SIZE);

    let cleanedUp = 0;

    for (const perm of expiredPermissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
      });
      cleanedUp++;
    }

    return { cleanedUp };
  },
});
