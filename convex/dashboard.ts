import { query } from "./_generated/server";

/**
 * Dashboard Statistics Queries
 * Provides aggregated data for the dashboard overview
 */

/**
 * Get dashboard statistics - projects, variables, team members, audit events
 */
export const getStats = query({
  args: {},
  handler: async (ctx) => {
    // Get all projects (not deleted)
    const projects = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Get all variables (not deleted)
    const variables = await ctx.db
      .query("environmentVariables")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    // Count encrypted (sensitive) variables
    const encryptedCount = variables.filter((v) => v.isSensitive).length;

    // Get organization members count
    const members = await ctx.db.query("organizationMembers").collect();

    // Get audit logs from last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentAuditLogs = await ctx.db
      .query("auditLogs")
      .filter((q) => q.gte(q.field("createdAt"), sevenDaysAgo))
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
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db
      .query("auditLogs")
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
  args: {},
  handler: async (ctx) => {
    const projects = await ctx.db
      .query("projects")
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
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query("organizationMembers")
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
  args: {},
  handler: async (ctx) => {
    // Check if any projects exist
    const projectCount = await ctx.db
      .query("projects")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(1);

    // Check if any variables exist
    const variableCount = await ctx.db
      .query("environmentVariables")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(1);

    // Check if any team members have been invited (more than 1 member)
    const memberCount = await ctx.db.query("organizationMembers").take(2);

    // Check if any project access tokens exist (CLI/IDE integration)
    const accessTokenCount = await ctx.db
      .query("projectAccess")
      .filter((q) => q.eq(q.field("isActive"), true))
      .take(1);

    return {
      hasProjects: projectCount.length > 0,
      hasVariables: variableCount.length > 0,
      hasTeamMembers: memberCount.length > 1,
      hasIntegrations: accessTokenCount.length > 0,
    };
  },
});
