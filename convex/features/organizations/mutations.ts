import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { resolveFeatureForUser } from "../featureRegistry/resolver";
import { getDefaultTierName } from "../billing/tierLimits";
import { rateLimiter } from "../../lib/rateLimits";
import { writeTombstone } from "./tombstones";
import {
  assertOrgAction,
  assertCanManageUser,
  assertCanAssignRole,
  normalizeOrgRole,
} from "../../lib/authz";

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
    workosOrgId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Rate limit: prevent excessive org creation
    await rateLimiter.limit(ctx, "orgCreate", {
      key: actor._id,
      throws: true,
    });

    const now = Date.now();

    // Check organization creation limits based on user's tier
    const userMemberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect()
      .then((rows) =>
        rows.filter((doc) => normalizeOrgRole(doc.role) === "owner")
      );

    const orgResolved = await resolveFeatureForUser(
      ctx.db,
      actor._id,
      "max_organizations"
    );
    const orgLimit = orgResolved.value as number | null;

    if (orgLimit !== null && userMemberships.length >= orgLimit) {
      throw new Error(
        `Organization limit reached (${userMemberships.length}/${orgLimit}). Upgrade your tier for more organizations.`
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
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    // Ensure the org owner has a user tier record
    const defaultTier = await getDefaultTierName(ctx.db);
    const existingUserTier = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .first();
    if (!existingUserTier) {
      await ctx.db.insert("userTiers", {
        userId: actor._id,
        tier: defaultTier,
        updatedAt: now,
        reason: "org_created",
      });
    }

    await ctx.db.insert("organizationMembers", {
      organizationId,
      userId: actor._id,
      role: "owner",
      joinedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      organizationId,
      userId: actor._id,
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
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: only admins can update org details
    await assertOrgAction(ctx, actor._id, args.organizationId, "org:update");

    const now = Date.now();
    const { organizationId, ...updates } = args;

    const org = await ctx.db.get(organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // If logoUrl is being set, check custom_branding feature gate
    if (updates.logoUrl !== undefined) {
      const brandingCheck = await checkBooleanFeature(
        ctx.db,
        organizationId,
        "custom_branding"
      );
      if (!brandingCheck.allowed) {
        throw new Error(
          "Custom branding is not available on your current tier."
        );
      }
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.logoUrl !== undefined) updateData.logoUrl = updates.logoUrl;

    await ctx.db.patch(organizationId, updateData);

    await ctx.db.insert("auditLogs", {
      organizationId,
      userId: actor._id,
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
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: only admins can delete an organization
    await assertOrgAction(ctx, actor._id, args.organizationId, "org:delete");

    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    // Audit log first (before deleting)
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
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
        .collect()
        .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

      for (const variable of variables) {
        await ctx.db.patch(variable._id, { deletedAt: now, updatedAt: now });

        // NOTE: variableVersions rows are intentionally NOT hard-deleted here.
        // The soft-deleted variables flow through the daily vault-GC sweep
        // (convex/vaultGc.ts), which purges each variable's version history,
        // permission grants, Vault objects, and row together once the 7-day
        // retention window elapses — so their Vault objects are reclaimed
        // instead of being leaked forever.

        // Deactivate variable permissions
        const permissions = await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
          .collect()
          .then((rows) => rows.filter((doc) => doc.isActive === true));
        for (const perm of permissions) {
          await ctx.db.patch(perm._id, {
            isActive: false,
            revokedAt: now,
            revokedBy: actor._id,
          });
        }
      }

      // Soft-delete shared accounts + deactivate their grants (mirrors the
      // variable cascade above). Previously the org delete never touched
      // projectAccounts, leaking them; they now flow through the vault-GC sweep.
      const accounts = await ctx.db
        .query("projectAccounts")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect()
        .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

      for (const account of accounts) {
        await ctx.db.patch(account._id, { deletedAt: now, updatedAt: now });

        const accountPermissions = await ctx.db
          .query("accountPermissions")
          .withIndex("by_account", (q) => q.eq("accountId", account._id))
          .collect()
          .then((rows) => rows.filter((doc) => doc.isActive === true));
        for (const perm of accountPermissions) {
          await ctx.db.patch(perm._id, {
            isActive: false,
            revokedAt: now,
            revokedBy: actor._id,
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
        .collect()
        .then((rows) => rows.filter((doc) => doc.isActive === true));
      for (const token of accessTokens) {
        await ctx.db.patch(token._id, { isActive: false });
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: token.accessToken,
          projectId: project._id,
          userId: token.userId,
          reason: "Organization deleted",
          revokedBy: actor._id,
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
          reviewedBy: actor._id,
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

    // Delete polar customers
    const polarCustomers = await ctx.db
      .query("polarCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const sc of polarCustomers) {
      await ctx.db.delete(sc._id);
    }

    // Note: userTiers records are kept even when orgs are deleted
    // (the user may own other orgs or re-create one later)

    // Delete org members. Everyone except the deleting actor gets an exit
    // notice — the actor chose the deletion, the rest would otherwise watch
    // the org silently vanish.
    const orgForName = await ctx.db.get(args.organizationId);
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    for (const member of members) {
      await ctx.db.delete(member._id);
      if (member.userId !== actor._id) {
        await writeTombstone(ctx, {
          userId: member.userId,
          organizationId: args.organizationId,
          organizationName: orgForName?.name ?? "your organization",
          kind: "org_deleted",
        });
      }
    }

    // Delete the organization
    await ctx.db.delete(args.organizationId);

    return args.organizationId;
  },
});

/**
 * Remove a member from an organization
 */
export const removeMember = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const isSelfRemoval = actor._id === args.userId;

    // Capture the caller's membership from assertOrgAction to avoid a second DB query
    let callerMembership: { role: string } | null = null;

    if (!isSelfRemoval) {
      // Authorization: only admins can remove OTHER members
      const result = await assertOrgAction(
        ctx,
        actor._id,
        args.organizationId,
        "org:remove_member"
      );
      callerMembership = result.membership;
    }

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

    // Prevent removing the last owner of the organization
    if (normalizeOrgRole(membership.role) === "owner") {
      const allMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();
      const ownerCount = allMembers.filter(
        (m) => normalizeOrgRole(m.role) === "owner"
      ).length;
      if (ownerCount <= 1) {
        throw new Error(
          "Cannot remove the last owner of the organization. Transfer ownership or promote another member to owner first."
        );
      }
    }

    // Hierarchy: when removing others, cannot remove a user at or above your level
    if (!isSelfRemoval && callerMembership) {
      assertCanManageUser(
        callerMembership.role,
        membership.role,
        "remove member"
      );
    }

    // Revoke all active extension/project access tokens for this user in this organization
    // so linked editors lose access and local cleanup can be triggered.
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    let revokedTokenCount = 0;

    for (const project of projects) {
      const activeTokens = await ctx.db
        .query("projectAccess")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", project._id).eq("userId", args.userId)
        )
        .collect()
        .then((rows) => rows.filter((doc) => doc.isActive === true));

      for (const token of activeTokens) {
        await ctx.db.patch(token._id, { isActive: false });
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: token.accessToken,
          projectId: project._id,
          userId: args.userId,
          reason: "Organization membership removed",
          revokedBy: actor._id,
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
          revokedBy: actor._id,
        });
        revokedPermissionCount++;
      }
    }

    await ctx.db.delete(membership._id);

    // Exit notice: the user's next sign-in shows "your access to X has been
    // revoked — contact your organization" instead of the org silently
    // vanishing (self-leave gets "left" wording).
    const org = await ctx.db.get(args.organizationId);
    await writeTombstone(ctx, {
      userId: args.userId,
      organizationId: args.organizationId,
      organizationName: org?.name ?? "your organization",
      kind: isSelfRemoval ? "left" : "removed",
    });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
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
      v.literal("owner"),
      v.literal("project_manager"),
      v.literal("team_lead"),
      v.literal("editor"),
      v.literal("developer"),
      v.literal("viewer")
    ),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: only owners can change roles
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:change_role"
    );

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

    const oldRoleNormalized = normalizeOrgRole(membership.role);

    // Prevent demoting the last owner of the organization
    if (oldRoleNormalized === "owner" && args.newRole !== "owner") {
      const allMembers = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect();
      const ownerCount = allMembers.filter(
        (m) => normalizeOrgRole(m.role) === "owner"
      ).length;
      if (ownerCount <= 1) {
        throw new Error(
          "Cannot demote the last owner of the organization. Promote another member to owner first."
        );
      }
    }

    // Hierarchy: cannot change role of someone at or above your level
    assertCanManageUser(callerMembership.role, membership.role, "change role");

    // Hierarchy: can only assign roles below your own (owners may assign any)
    assertCanAssignRole(callerMembership.role, args.newRole);

    const oldRole = membership.role;

    // When demoting from owner to a non-owner role, auto-create projectMembers
    // assignments for all org projects so the user doesn't lose access
    if (oldRoleNormalized === "owner" && args.newRole !== "owner") {
      const orgProjects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
        .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

      for (const project of orgProjects) {
        const existingPm = await ctx.db
          .query("projectMembers")
          .withIndex("by_project_and_user", (q) =>
            q.eq("projectId", project._id).eq("userId", args.userId)
          )
          .first();

        if (!existingPm) {
          // Pure scope assignment — capabilities come from the org role
          await ctx.db.insert("projectMembers", {
            projectId: project._id,
            userId: args.userId,
            addedBy: actor._id,
            addedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(membership._id, { role: args.newRole });

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: actor._id,
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
 * Transfer organization ownership to another user.
 * All members, projects, variables, and settings remain intact.
 * Only the owner (createdBy) changes and the new owner gets admin role.
 */
export const transferOwnership = mutation({
  args: {
    organizationId: v.id("organizations"),
    targetUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: only admins can transfer ownership
    const { membership: callerMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:transfer_ownership"
    );

    const now = Date.now();

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Verify target user exists
    const targetUser = await ctx.db.get(args.targetUserId);
    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Cannot transfer to yourself
    if (args.targetUserId === actor._id) {
      throw new Error("Cannot transfer ownership to yourself");
    }

    // Tier check — ownership transfer is allowed for all tiers
    // (removed hardcoded pro-only restriction)

    // Add or promote target user to owner
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("userId", args.targetUserId)
      )
      .first();

    if (targetMembership) {
      await ctx.db.patch(targetMembership._id, { role: "owner" });
    } else {
      await ctx.db.insert("organizationMembers", {
        organizationId: args.organizationId,
        userId: args.targetUserId,
        role: "owner",
        joinedAt: now,
        invitedBy: actor._id,
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
      userId: actor._id,
      action: "org.transferred",
      details: JSON.stringify({
        transferredFrom: actor._id,
        transferredTo: args.targetUserId,
      }),
      createdAt: now,
    });

    return args.organizationId;
  },
});
