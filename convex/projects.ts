import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { checkNumericLimit, countActiveProjects } from "./featureRegistry";
import { requireAuthedUser, requireBearerUser } from "./identity";
import {
  assertOrgAction,
  assertProjectAction,
  normalizeOrgRole,
  toLegacyProjectRole,
} from "./authz";

/**
 * Project Queries and Mutations
 */

// ==========================================
// QUERIES
// ==========================================

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));
  },
});

export const getById = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (project?.deletedAt) return null;
    return project;
  },
});

export const getBySlug = query({
  args: {
    organizationId: v.id("organizations"),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q.eq("organizationId", args.organizationId).eq("slug", args.slug)
      )
      .first();

    if (project?.deletedAt) return null;
    return project;
  },
});

async function listWithStatsCore(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  }
) {
  let projects = await ctx.db
    .query("projects")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", args.organizationId)
    )
    .collect()
    .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

  // Resolve org membership and project assignments for visibility.
  // Owners see all org projects; everyone else only sees projects they
  // are assigned to via projectMembers.
  let userRole: string | null = null;
  const assignedProjectIds = new Set<string>();

  const userId = args.userId;
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", userId)
    )
    .first();

  // Fail closed: a non-member of this org sees nothing. Previously the
  // visibility filter was skipped when membership was absent, which returned
  // the ENTIRE org project list to any authenticated non-member.
  if (!membership) {
    return [];
  }

  userRole = normalizeOrgRole(membership.role);

  if (normalizeOrgRole(membership.role) !== "owner") {
    // Get user's project assignments
    const projectMemberships = await ctx.db
      .query("projectMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const pm of projectMemberships) {
      assignedProjectIds.add(pm.projectId.toString());
    }

    projects = projects.filter((p) =>
      assignedProjectIds.has(p._id.toString())
    );
  }

  const projectsWithStats = await Promise.all(
    projects.map(async (project) => {
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect()
        .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

      return {
        ...project,
        variableCount: variables.length,
        userRole: userRole as string | null,
        // Legacy compatibility: derived from the unified org role + assignment
        projectRole: userRole
          ? (toLegacyProjectRole(
              normalizeOrgRole(userRole),
              assignedProjectIds.has(project._id.toString())
            ) as string | null)
          : null,
      };
    })
  );

  return projectsWithStats;
}

export const listWithStats = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return listWithStatsCore(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
    });
  },
});

export const listWithStatsForToken = query({
  args: {
    accessToken: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireBearerUser(ctx, args.accessToken);
    return listWithStatsCore(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
    });
  },
});

async function listForUserCore(ctx: QueryCtx, userId: Id<"users">) {
  const memberships = await ctx.db
    .query("organizationMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const allProjects = await Promise.all(
    memberships.map(async (membership) => {
      const orgRole = normalizeOrgRole(membership.role);

      // Owners see all projects in the org
      if (orgRole === "owner") {
        const projects = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", membership.organizationId)
          )
          .collect()
          .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

        return projects.map((project) => ({
          ...project,
          userRole: orgRole as string,
          projectRole: null as string | null,
        }));
      }

      // Everyone else only sees projects they're assigned to
      const projectMemberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const projectsInOrg = await Promise.all(
        projectMemberships.map(async (pm) => {
          const project = await ctx.db.get(pm.projectId);
          if (
            !project ||
            project.deletedAt ||
            project.organizationId !== membership.organizationId
          ) {
            return null;
          }
          return {
            ...project,
            userRole: orgRole as string,
            // Legacy compatibility: derived from the unified org role
            projectRole: toLegacyProjectRole(orgRole, true) as string | null,
          };
        })
      );

      return projectsInOrg.filter(
        (p): p is NonNullable<typeof p> => p !== null
      );
    })
  );

  return allProjects.flat();
}

export const listForUser = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return listForUserCore(ctx, actor._id);
  },
});

export const listForUserForToken = query({
  args: { accessToken: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireBearerUser(ctx, args.accessToken);
    return listForUserCore(ctx, actor._id);
  },
});

// ==========================================
// MUTATIONS
// ==========================================

export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    organizationId: v.id("organizations"),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: owners and project managers can create projects
    const { membership: creatorMembership } = await assertOrgAction(
      ctx,
      actor._id,
      args.organizationId,
      "org:create_project"
    );

    const now = Date.now();

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Check tier limits for project creation
    const projectCount = await countActiveProjects(ctx.db, args.organizationId);
    const projectCheck = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "max_projects",
      projectCount
    );
    if (!projectCheck.allowed) {
      throw new Error(projectCheck.reason!);
    }

    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q.eq("organizationId", args.organizationId).eq("slug", args.slug)
      )
      .first();

    if (existingProject && !existingProject.deletedAt) {
      throw new Error("Project slug already exists in this organization");
    }

    const projectId = await ctx.db.insert("projects", {
      name: args.name,
      slug: args.slug,
      description: args.description,
      organizationId: args.organizationId,
      icon: args.icon,
      color: args.color,
      createdBy: actor._id,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-assign the creator to the project. Owners have implicit access to
    // every project; project managers need an explicit assignment.
    if (creatorMembership.role === "project_manager") {
      await ctx.db.insert("projectMembers", {
        projectId,
        userId: actor._id,
        addedBy: actor._id,
        addedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      projectId,
      userId: actor._id,
      action: "project.created",
      details: JSON.stringify({ name: args.name, slug: args.slug }),
      createdAt: now,
    });

    return projectId;
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Authorization: org admins or project managers can update
    await assertProjectAction(ctx, actor._id, args.projectId, "project:update");

    const now = Date.now();
    const { projectId, ...updates } = args;

    const project = await ctx.db.get(projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.icon !== undefined) updateData.icon = updates.icon;
    if (updates.color !== undefined) updateData.color = updates.color;

    await ctx.db.patch(projectId, updateData);

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId,
      userId: actor._id,
      action: "project.updated",
      details: JSON.stringify(updates),
      createdAt: now,
    });

    return projectId;
  },
});

export const remove = mutation({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: only org admins can delete projects
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:delete_project"
    );

    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    // Soft-delete the project
    await ctx.db.patch(args.projectId, {
      deletedAt: now,
      updatedAt: now,
    });

    // Soft-delete all variables
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    for (const variable of variables) {
      await ctx.db.patch(variable._id, {
        deletedAt: now,
        updatedAt: now,
      });
    }

    // NOTE: variableVersions rows are intentionally NOT hard-deleted here.
    // The soft-deleted variables above now flow through the daily vault-GC
    // sweep (convex/vaultGc.ts), which purges each variable's version history,
    // permission grants, Vault objects, and row together once the 7-day
    // retention window elapses. Keeping version rows means a project restored
    // within the window keeps its full variable history.

    // Deactivate variable permissions for each variable
    let deactivatedPermissions = 0;
    for (const variable of variables) {
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
        deactivatedPermissions++;
      }
    }

    // Soft-delete shared accounts + deactivate their grants (mirrors the
    // variable cascade above). Previously the project delete never touched
    // projectAccounts at all, leaking them. The soft-deleted accounts now flow
    // through the daily vault-GC sweep (convex/vaultGc.ts) alongside variables.
    const accounts = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    let deactivatedAccountPermissions = 0;
    for (const account of accounts) {
      await ctx.db.patch(account._id, {
        deletedAt: now,
        updatedAt: now,
      });

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
        deactivatedAccountPermissions++;
      }
    }

    // Delete project members
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const member of projectMembers) {
      await ctx.db.delete(member._id);
    }

    // Revoke project access tokens
    let revokedTokens = 0;
    const accessTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));
    for (const token of accessTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: token.userId,
        reason: "Project deleted",
        revokedBy: actor._id,
        revokedAt: now,
        acknowledged: false,
        expiresAt: revocationExpiresAt,
      });
      revokedTokens++;
    }

    // Cancel pending variable requests
    let canceledRequests = 0;
    const pendingRequests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .collect();
    for (const req of pendingRequests) {
      await ctx.db.patch(req._id, {
        status: "canceled",
        reviewReason: "Project deleted",
        reviewedBy: actor._id,
        reviewedAt: now,
        updatedAt: now,
      });
      canceledRequests++;
    }

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.deleted",
      details: JSON.stringify({
        variablesDeleted: variables.length,
        permissionsDeactivated: deactivatedPermissions,
        accountsDeleted: accounts.length,
        accountPermissionsDeactivated: deactivatedAccountPermissions,
        membersRemoved: projectMembers.length,
        tokensRevoked: revokedTokens,
        requestsCanceled: canceledRequests,
      }),
      createdAt: now,
    });

    return args.projectId;
  },
});

/**
 * Move a project to another organization
 */
export const move = mutation({
  args: {
    projectId: v.id("projects"),
    targetOrganizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    if (project.organizationId === args.targetOrganizationId) {
      throw new Error("Project is already in the target organization");
    }

    const sourceOrg = await ctx.db.get(project.organizationId);
    if (!sourceOrg) {
      throw new Error("Source organization not found");
    }

    const targetOrg = await ctx.db.get(args.targetOrganizationId);
    if (!targetOrg) {
      throw new Error("Target organization not found");
    }

    // Authorization: moving a project removes it from the source org
    // (delete-level power) and creates it in the target org (create-level power)
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:delete_project"
    );
    await assertOrgAction(
      ctx,
      actor._id,
      args.targetOrganizationId,
      "org:create_project"
    );

    // Check if target org has room for another project
    const targetProjectCount = await countActiveProjects(
      ctx.db,
      args.targetOrganizationId
    );
    const moveCheck = await checkNumericLimit(
      ctx.db,
      args.targetOrganizationId,
      "max_projects",
      targetProjectCount
    );
    if (!moveCheck.allowed) {
      throw new Error(
        `Target organization has reached its project limit. ${moveCheck.reason}`
      );
    }

    // Check slug uniqueness in target org
    const existingSlug = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q
          .eq("organizationId", args.targetOrganizationId)
          .eq("slug", project.slug)
      )
      .collect()
      .then((rows) => rows.find((doc) => doc.deletedAt === undefined) ?? null);

    if (existingSlug) {
      throw new Error(
        `A project with slug "${project.slug}" already exists in the target organization`
      );
    }

    // Move the project
    await ctx.db.patch(args.projectId, {
      organizationId: args.targetOrganizationId,
      updatedAt: now,
    });

    // Clean up source org relationships
    // Delete project members
    let removedMembers = 0;
    const projectMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const member of projectMembers) {
      await ctx.db.delete(member._id);
      removedMembers++;
    }

    // Revoke project access tokens
    let revokedTokens = 0;
    const accessTokens = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.isActive === true));
    for (const token of accessTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: token.userId,
        reason: "Project moved to another organization",
        revokedBy: actor._id,
        revokedAt: now,
        acknowledged: false,
        expiresAt: revocationExpiresAt,
      });
      revokedTokens++;
    }

    // Deactivate variable permissions
    let deactivatedPermissions = 0;
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect()
      .then((rows) => rows.filter((doc) => doc.deletedAt === undefined));

    for (const variable of variables) {
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
        deactivatedPermissions++;
      }
    }

    // Cancel pending variable requests
    let canceledRequests = 0;
    const pendingRequests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .collect();
    for (const req of pendingRequests) {
      await ctx.db.patch(req._id, {
        status: "canceled",
        reviewReason: "Project moved to another organization",
        reviewedBy: actor._id,
        reviewedAt: now,
        updatedAt: now,
      });
      canceledRequests++;
    }

    // Audit log in source org
    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.moved",
      details: JSON.stringify({
        targetOrganizationId: args.targetOrganizationId,
        targetOrganizationName: targetOrg.name,
        removedMembers,
        revokedTokens,
        deactivatedPermissions,
        canceledRequests,
      }),
      createdAt: now,
    });

    // Audit log in target org
    await ctx.db.insert("auditLogs", {
      organizationId: args.targetOrganizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "project.moved",
      details: JSON.stringify({
        sourceOrganizationId: project.organizationId,
        sourceOrganizationName: sourceOrg.name,
        variableCount: variables.length,
      }),
      createdAt: now,
    });

    return args.projectId;
  },
});
