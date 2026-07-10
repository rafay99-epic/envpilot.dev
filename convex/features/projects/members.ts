import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  assertProjectAction,
  assertCanManageUser,
  normalizeOrgRole,
  roleLevel,
} from "../../lib/authz";

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
async function getProjectMembershipCore(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  return await ctx.db
    .query("projectMembers")
    .withIndex("by_project_and_user", (q) =>
      q.eq("projectId", projectId).eq("userId", userId)
    )
    .first();
}

export const getProjectMembership = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return getProjectMembershipCore(ctx, args.projectId, actor._id);
  },
});

/**
 * Get org members who can be assigned to a project
 * (i.e., org members who are NOT already project members)
 */
export const getAssignableOrgMembers = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    // Must be allowed to manage project members (owner bypasses assignment;
    // project managers and team leads need an assignment)
    let requesterRole: string;
    try {
      const auth = await assertProjectAction(
        ctx,
        actor._id,
        args.projectId,
        "project:manage_members"
      );
      requesterRole = auth.orgRole;
    } catch (err) {
      console.error("projectMembers.getAssignableOrgMembers.denied", {
        projectId: args.projectId,
        requestingUserId: actor._id,
        error: String(err),
      });
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
          if (member.userId === actor._id) return false;
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
    // Environment scope for the assignment — only applied to developers
    // (owners/PMs/team leads are always unrestricted). Omit for all
    // environments.
    environments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      actor._id,
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

    if (args.environments && args.environments.length === 0) {
      throw new Error(
        "Environment scope cannot be empty — omit it to allow all environments"
      );
    }

    // Environment scope only constrains developers — owners, PMs, and team
    // leads are always unrestricted, so a scope on their assignment is ignored
    const environmentScope =
      normalizeOrgRole(targetOrgMembership.role) === "developer"
        ? args.environments
        : undefined;

    // Pure scope assignment — capabilities come from the org role
    const membershipId = await ctx.db.insert("projectMembers", {
      projectId: args.projectId,
      userId: args.userId,
      ...(environmentScope ? { environments: environmentScope } : {}),
      addedBy: actor._id,
      addedAt: now,
    });

    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.member_added",
      details: JSON.stringify({
        addedUserId: args.userId,
        addedUserEmail: targetUser?.email,
        orgRole: normalizeOrgRole(targetOrgMembership.role),
        environments: environmentScope ?? "all",
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
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      actor._id,
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
          revokedBy: actor._id,
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
        revokedBy: actor._id,
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
      userId: actor._id,
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
 * Set (or clear) the environment scope on a developer's project assignment.
 *
 * A scoped developer can only access variables whose environments are ALL
 * inside the scope (see authz.isEnvironmentScopeAllowed) — e.g. a scope of
 * ["development", "staging"] makes production variables invisible and
 * untouchable. Omitting `environments` clears the scope (unrestricted).
 * Only meaningful for developers — owners, project managers, and team leads
 * are always unrestricted.
 *
 * Hierarchy rule: the actor may only modify users whose org role is strictly
 * below their own.
 */
export const setMemberEnvironments = mutation({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    // Omit to clear the scope (all environments); must not be empty
    environments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners, project managers, and team leads (assigned)
    const { orgRole: actorRole } = await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:manage_members"
    );

    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    if (args.environments && args.environments.length === 0) {
      throw new Error(
        "Environment scope cannot be empty — omit it to allow all environments"
      );
    }

    const targetOrgMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!targetOrgMembership) {
      throw new Error("Target user is not a member of the organization");
    }

    // Environment scopes only constrain developers — everyone else always
    // has access to all environments
    if (normalizeOrgRole(targetOrgMembership.role) !== "developer") {
      throw new Error(
        "Environment scopes only apply to developers — owners, project managers, and team leads always have access to all environments"
      );
    }

    // Hierarchy: can only modify users whose org role is strictly below your own
    assertCanManageUser(
      actorRole,
      targetOrgMembership.role,
      "change environment scope"
    );

    const membership = await ctx.db
      .query("projectMembers")
      .withIndex("by_project_and_user", (q) =>
        q.eq("projectId", args.projectId).eq("userId", args.userId)
      )
      .first();

    if (!membership) {
      throw new Error("User is not a member of this project");
    }

    const previousScope = membership.environments;

    // Patching with undefined clears the field (unrestricted)
    await ctx.db.patch(membership._id, { environments: args.environments });

    const targetUser = await ctx.db.get(args.userId);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.member_environments_changed",
      details: JSON.stringify({
        targetUserId: args.userId,
        targetUserEmail: targetUser?.email,
        environments: args.environments ?? "all",
        previous: previousScope ?? "all",
      }),
      createdAt: now,
    });

    return membership._id;
  },
});
