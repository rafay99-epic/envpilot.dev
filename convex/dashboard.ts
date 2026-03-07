import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Dashboard Statistics Queries
 * Provides aggregated data for the dashboard overview
 */

/**
 * Get dashboard statistics - projects, variables, team members, audit events
 */
export const getStats = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Get org projects (not deleted)
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Get variables only for projects in this organization
    const variablesNested = await Promise.all(
      projects.map((project) =>
        ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect()
      )
    );
    const variables = variablesNested.flat();

    // Count encrypted (sensitive) variables
    const encryptedCount = variables.filter((v) => v.isSensitive).length;

    // Get organization members count
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .collect();

    // Get audit logs from last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentAuditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId).gte("createdAt", sevenDaysAgo)
      )
      .collect();

    // Get projects created this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const projectsThisMonth = projects.filter(
      (p) => p.createdAt >= startOfMonth.getTime()
    ).length;

    return {
      projects: {
        total: projects.length,
        thisMonth: projectsThisMonth,
      },
      variables: {
        total: variables.length,
        encrypted: encryptedCount,
      },
      team: {
        total: members.length,
      },
      auditEvents: {
        last7Days: recentAuditLogs.length,
      },
    };
  },
});

/**
 * Get recent activity for the dashboard
 */
export const getRecentActivity = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(10);

    const logsWithDetails = await Promise.all(
      logs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        const project = log.projectId ? await ctx.db.get(log.projectId) : null;

        return {
          _id: log._id,
          action: log.action,
          createdAt: log.createdAt,
          details: log.details,
          user: user
            ? {
                name: user.name ?? user.email,
                avatarUrl: user.avatarUrl,
              }
            : null,
          project: project
            ? {
                name: project.name,
                slug: project.slug,
              }
            : null,
        };
      })
    );

    return logsWithDetails;
  },
});

/**
 * Get recent projects for dashboard quick view
 */
export const getRecentProjects = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .order("desc")
      .take(5);

    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();

        return {
          _id: project._id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          icon: project.icon,
          color: project.color,
          createdAt: project.createdAt,
          variableCount: variables.length,
        };
      })
    );

    return projectsWithStats;
  },
});

/**
 * Get team members for dashboard quick view
 */
export const getTeamMembers = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .order("desc")
      .take(5);

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const user = await ctx.db.get(membership.userId);
        return user
          ? {
              _id: membership._id,
              role: membership.role,
              joinedAt: membership.joinedAt,
              user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
              },
            }
          : null;
      })
    );

    return members.filter(Boolean);
  },
});

/**
 * Check onboarding completion status
 */
export const getOnboardingStatus = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    // Check if any projects exist
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const projectCount = projects.length;
    const projectIds = new Set(projects.map((project) => project._id));

    // Check if any variables exist in org projects
    let hasVariables = false;
    for (const projectId of projectIds) {
      const vars = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(1);

      if (vars.length > 0) {
        hasVariables = true;
        break;
      }
    }

    // Check if any team members have been invited (more than 1 member)
    const memberCount = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) => q.eq("organizationId", args.organizationId))
      .take(2);

    // Check if any project access tokens exist (CLI/IDE integration) for org projects
    let hasIntegrations = false;
    for (const projectId of projectIds) {
      const accessTokenCount = await ctx.db
        .query("projectAccess")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .take(1);

      if (accessTokenCount.length > 0) {
        hasIntegrations = true;
        break;
      }
    }

    return {
      hasProjects: projectCount > 0,
      hasVariables,
      hasTeamMembers: memberCount.length > 1,
      hasIntegrations,
    };
  },
});
