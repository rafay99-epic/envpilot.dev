import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getTierLimits } from "./tierLimits";

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
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();

        return { ...project, variableCount: variables.length };
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
        }));
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

    const limits = getTierLimits(org.tier);
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

    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    await ctx.db.patch(args.projectId, {
      deletedAt: now,
      updatedAt: now,
    });

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

    await ctx.db.insert("auditLogs", {
      organizationId: project.organizationId,
      projectId: args.projectId,
      userId: args.deletedBy,
      action: "project.deleted",
      details: JSON.stringify({ variablesDeleted: variables.length }),
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

    const limits = getTierLimits(org.tier);
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
