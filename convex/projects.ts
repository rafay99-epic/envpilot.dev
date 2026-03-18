import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getTierLimits, getOrganizationTier } from "./tierLimits";

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
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();
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

export const listWithStats = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    let projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Resolve org membership and project memberships for role data
    let userRole: string | null = null;
    let projectMemberships: Array<{
      projectId: { toString(): string };
      role: string;
    }> = [];

    if (args.userId) {
      const userId = args.userId;
      const membership = await ctx.db
        .query("organizationMembers")
        .withIndex("by_org_and_user", (q) =>
          q.eq("organizationId", args.organizationId).eq("userId", userId)
        )
        .first();

      if (membership) {
        userRole = membership.role;
      }

      if (membership && membership.role !== "admin") {
        // Get user's project memberships
        projectMemberships = await ctx.db
          .query("projectMembers")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();

        const assignedProjectIds = new Set(
          projectMemberships.map((pm) => pm.projectId.toString())
        );

        projects = projects.filter((p) =>
          assignedProjectIds.has(p._id.toString())
        );
      }
    }

    // Build a lookup map for project roles
    const projectRoleMap = new Map(
      projectMemberships.map((pm) => [pm.projectId.toString(), pm.role])
    );

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();

        return {
          ...project,
          variableCount: variables.length,
          userRole: userRole as string | null,
          projectRole:
            (projectRoleMap.get(project._id.toString()) as string | null) ??
            null,
        };
      })
    );

    return projectsWithStats;
  },
});

export const listForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const allProjects = await Promise.all(
      memberships.map(async (membership) => {
        // Admins see all projects in the org
        if (membership.role === "admin") {
          const projects = await ctx.db
            .query("projects")
            .withIndex("by_organization", (q) =>
              q.eq("organizationId", membership.organizationId)
            )
            .filter((q) => q.eq(q.field("deletedAt"), undefined))
            .collect();

          return projects.map((project) => ({
            ...project,
            userRole: membership.role,
            projectRole: null as string | null,
          }));
        }

        // Team leads and members only see projects they're assigned to
        const projectMemberships = await ctx.db
          .query("projectMembers")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
              userRole: membership.role,
              projectRole: pm.role as string | null,
            };
          })
        );

        return projectsInOrg.filter(
          (p): p is NonNullable<typeof p> => p !== null
        );
      })
    );

    return allProjects.flat();
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
    createdBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check tier limits for project creation
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    // Check if team leads are allowed to create projects
    const creatorMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.createdBy)
      )
      .first();

    if (creatorMembership?.role === "team_lead") {
      const teamLeadsCanCreate =
        org.settings?.teamLeadsCanCreateProjects ?? true;
      if (!teamLeadsCanCreate) {
        throw new Error(
          "Project creation is restricted to admins in this organization"
        );
      }
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = getTierLimits(tier);
    if (limits.maxProjects !== null) {
      const projectCount = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      if (projectCount.length >= limits.maxProjects) {
        throw new Error(
          `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade to Pro for unlimited projects.`
        );
      }
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
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    // Auto-add the creator as a project manager (unless they're an admin)
    if (creatorMembership && creatorMembership.role !== "admin") {
      await ctx.db.insert("projectMembers", {
        projectId,
        userId: args.createdBy,
        role: "manager",
        addedBy: args.createdBy,
        addedAt: now,
      });
    }

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      projectId,
      userId: args.createdBy,
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
    updatedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { projectId, updatedBy, ...updates } = args;

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
      userId: updatedBy,
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
    deletedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const revocationExpiresAt = now + 24 * 60 * 60 * 1000;

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Soft-delete the project
    await ctx.db.patch(args.projectId, {
      deletedAt: now,
      updatedAt: now,
    });

    // Soft-delete all variables
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    for (const variable of variables) {
      await ctx.db.patch(variable._id, {
        deletedAt: now,
        updatedAt: now,
      });
    }

    // Delete variable versions for each variable
    let deletedVersions = 0;
    for (const variable of variables) {
      const versions = await ctx.db
        .query("variableVersions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .collect();
      for (const version of versions) {
        await ctx.db.delete(version._id);
        deletedVersions++;
      }
    }

    // Deactivate variable permissions for each variable
    let deactivatedPermissions = 0;
    for (const variable of variables) {
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.deletedBy,
        });
        deactivatedPermissions++;
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
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    for (const token of accessTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: token.userId,
        reason: "Project deleted",
        revokedBy: args.deletedBy,
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
        reviewedBy: args.deletedBy,
        reviewedAt: now,
        updatedAt: now,
      });
      canceledRequests++;
    }

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.deletedBy,
      action: "project.deleted",
      details: JSON.stringify({
        variablesDeleted: variables.length,
        versionsDeleted: deletedVersions,
        permissionsDeactivated: deactivatedPermissions,
        membersRemoved: projectMembers.length,
        tokensRevoked: revokedTokens,
        requestsCanceled: canceledRequests,
      }),
      createdAt: now,
    });

    return args.projectId;
  },
});

export const restore = mutation({
  args: {
    projectId: v.id("projects"),
    restoredBy: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    if (!project.deletedAt) {
      throw new Error("Project is not deleted");
    }

    await ctx.db.patch(args.projectId, {
      deletedAt: undefined,
      updatedAt: now,
    });

    return args.projectId;
  },
});

export const duplicate = mutation({
  args: {
    projectId: v.id("projects"),
    newName: v.string(),
    newSlug: v.string(),
    createdBy: v.id("users"),
    includeVariables: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const sourceProject = await ctx.db.get(args.projectId);
    if (!sourceProject || sourceProject.deletedAt) {
      throw new Error("Source project not found");
    }

    // Check tier limits for project creation
    const org = await ctx.db.get(sourceProject.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const tier = await getOrganizationTier(
      ctx.db,
      sourceProject.organizationId
    );
    const limits = getTierLimits(tier);
    if (limits.maxProjects !== null) {
      const projectCount = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", sourceProject.organizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      if (projectCount.length >= limits.maxProjects) {
        throw new Error(
          `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade to Pro for unlimited projects.`
        );
      }
    }

    const existingProject = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q
          .eq("organizationId", sourceProject.organizationId)
          .eq("slug", args.newSlug)
      )
      .first();

    if (existingProject && !existingProject.deletedAt) {
      throw new Error("Project slug already exists");
    }

    const newProjectId = await ctx.db.insert("projects", {
      name: args.newName,
      slug: args.newSlug,
      description: sourceProject.description,
      organizationId: sourceProject.organizationId,
      icon: sourceProject.icon,
      color: sourceProject.color,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    if (args.includeVariables) {
      const variables = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      for (const variable of variables) {
        await ctx.db.insert("environmentVariables", {
          key: variable.key,
          vaultRef: variable.vaultRef,
          description: variable.description,
          environments: variable.environments,
          projectId: newProjectId,
          isSensitive: variable.isSensitive,
          createdBy: args.createdBy,
          lastModifiedBy: args.createdBy,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Copy project members from source project
    const sourceMembers = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const member of sourceMembers) {
      await ctx.db.insert("projectMembers", {
        projectId: newProjectId,
        userId: member.userId,
        role: member.role,
        addedBy: args.createdBy,
        addedAt: now,
      });
    }

    // Auto-add the creator as manager if not already a member and not admin
    const creatorMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", sourceProject.organizationId)
          .eq("userId", args.createdBy)
      )
      .first();

    if (creatorMembership && creatorMembership.role !== "admin") {
      const creatorAlreadyMember = sourceMembers.some(
        (m) => m.userId === args.createdBy
      );
      if (!creatorAlreadyMember) {
        await ctx.db.insert("projectMembers", {
          projectId: newProjectId,
          userId: args.createdBy,
          role: "manager",
          addedBy: args.createdBy,
          addedAt: now,
        });
      }
    }

    await ctx.db.insert("auditLogs", {
      organizationId: sourceProject.organizationId,
      projectId: newProjectId,
      userId: args.createdBy,
      action: "project.created",
      details: JSON.stringify({
        name: args.newName,
        slug: args.newSlug,
        duplicatedFrom: args.projectId,
      }),
      createdAt: now,
    });

    return newProjectId;
  },
});

/**
 * Move a project to another organization
 */
export const move = mutation({
  args: {
    projectId: v.id("projects"),
    targetOrganizationId: v.id("organizations"),
    movedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
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

    // Verify caller is admin in source org
    const sourceMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", project.organizationId)
          .eq("userId", args.movedBy)
      )
      .first();

    if (!sourceMembership || sourceMembership.role !== "admin") {
      throw new Error("You must be an admin in the source organization");
    }

    // Verify caller is admin in target org
    const targetMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q
          .eq("organizationId", args.targetOrganizationId)
          .eq("userId", args.movedBy)
      )
      .first();

    if (!targetMembership || targetMembership.role !== "admin") {
      throw new Error("You must be an admin of the target organization");
    }

    // Tier check: both orgs must be pro
    const sourceTier = await getOrganizationTier(
      ctx.db,
      project.organizationId
    );
    const targetTier = await getOrganizationTier(
      ctx.db,
      args.targetOrganizationId
    );
    const limits = getTierLimits(sourceTier);
    const targetLimits = getTierLimits(targetTier);
    if (limits.maxProjects !== null || targetLimits.maxProjects !== null) {
      // If either org has limits, check pro tier
      if (sourceTier !== "pro" || targetTier !== "pro") {
        throw new Error(
          "Both organizations must be on the Pro plan to transfer projects"
        );
      }
    }

    // Check slug uniqueness in target org
    const existingSlug = await ctx.db
      .query("projects")
      .withIndex("by_org_and_slug", (q) =>
        q
          .eq("organizationId", args.targetOrganizationId)
          .eq("slug", project.slug)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    if (existingSlug) {
      throw new Error(
        `A project with slug "${project.slug}" already exists in the target organization`
      );
    }

    // Check target org project count
    if (targetLimits.maxProjects !== null) {
      const targetProjects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.targetOrganizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect();

      if (targetProjects.length >= targetLimits.maxProjects) {
        throw new Error(
          `Target organization has reached its project limit (${targetLimits.maxProjects})`
        );
      }
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
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();
    for (const token of accessTokens) {
      await ctx.db.patch(token._id, { isActive: false });
      await ctx.db.insert("permissionRevocationEvents", {
        accessToken: token.accessToken,
        projectId: args.projectId,
        userId: token.userId,
        reason: "Project moved to another organization",
        revokedBy: args.movedBy,
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
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    for (const variable of variables) {
      const permissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();
      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: args.movedBy,
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
        reviewedBy: args.movedBy,
        reviewedAt: now,
        updatedAt: now,
      });
      canceledRequests++;
    }

    // Audit log in source org
    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.movedBy,
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
      userId: args.movedBy,
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
