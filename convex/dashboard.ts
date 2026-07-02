import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { batchGetUsers } from "./helpers";
import { resolveFeatureValue } from "./featureRegistry";
import { normalizeOrgRole } from "./authz";

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
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter((p) => p.deletedAt === undefined);

    // Count variables + sensitive variables with a bounded global scan.
    // Collecting every variable of every project re-ran on every variable
    // write and could blow the read budget for a variable-heavy org. We cap the
    // total documents scanned across all projects; if the cap is hit the totals
    // are approximate (marked via `approximate`).
    const VARIABLE_SCAN_CAP = 2000;
    let variablesTotal = 0;
    let encryptedCount = 0;
    let variablesCapped = false;
    let variableBudget = VARIABLE_SCAN_CAP;
    for (const project of projects) {
      if (variableBudget <= 0) {
        variablesCapped = true;
        break;
      }
      const projectVars = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .take(variableBudget);
      variableBudget -= projectVars.length;
      for (const variable of projectVars) {
        if (variable.deletedAt !== undefined) continue;
        variablesTotal++;
        if (variable.isSensitive) encryptedCount++;
      }
    }

    // Get organization members count
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Get pending variable requests count
    const pendingRequests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "pending")
      )
      .collect();

    // Get audit logs from last 7 days. Every mutation in the app writes an
    // auditLogs row, so an unbounded collect here re-reads the entire week's
    // audit trail on every write. Cap the scan; the count saturates at the cap
    // ("500+" semantics via the `capped` flag below).
    const AUDIT_EVENT_CAP = 500;
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentAuditLogs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("createdAt", sevenDaysAgo)
      )
      .take(AUDIT_EVENT_CAP);

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
        total: variablesTotal,
        encrypted: encryptedCount,
        // True when the variable scan hit VARIABLE_SCAN_CAP; totals are a
        // lower-bound approximation in that case.
        approximate: variablesCapped,
      },
      team: {
        total: members.length,
      },
      auditEvents: {
        last7Days: recentAuditLogs.length,
        // True when the count saturated at AUDIT_EVENT_CAP ("500+").
        capped: recentAuditLogs.length >= AUDIT_EVENT_CAP,
      },
      pendingRequests: {
        total: pendingRequests.length,
      },
    };
  },
});

/**
 * Get recent activity for the dashboard.
 *
 * Audit entries surface variableKey/environment details, so this is
 * access-gated: the caller must be an org member, and developers only see
 * entries for projects they are assigned to (org-level entries with no
 * project, e.g. member changes, remain visible to all members). Owners /
 * project managers / team leads see the full org feed.
 */
export const getRecentActivity = query({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Require org membership before surfacing any activity.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();
    if (!membership) return [];

    const orgRole = normalizeOrgRole(membership.role);

    // Developers are scoped to the projects they're assigned to. Resolve the
    // assigned project set once so we can drop out-of-scope entries.
    let assignedProjectIds: Set<string> | null = null;
    if (orgRole === "developer") {
      const assignments = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
      assignedProjectIds = new Set(
        assignments.map((pm) => pm.projectId as string)
      );
    }

    // Over-fetch (developers only) so that after project-scope filtering we can
    // still return ~10 rows. 40 is a tighter bound than the old 100 that still
    // yields ~10 visible rows in practice while cutting audit reads 60%.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(assignedProjectIds ? 40 : 10);

    // Developer scope: keep org-level entries (no projectId) and entries for
    // assigned projects only.
    const scoped = assignedProjectIds
      ? logs.filter(
          (log) =>
            !log.projectId || assignedProjectIds!.has(log.projectId as string)
        )
      : logs;

    const visible = scoped.slice(0, 10);

    const logsWithDetails = await Promise.all(
      visible.map(async (log) => {
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
    const recentProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(50);
    const projects = recentProjects
      .filter((p) => p.deletedAt === undefined)
      .slice(0, 5);

    // Cap the per-project variable read. Collecting every variable of each of
    // the 5 shown projects re-ran on every variable write; for a "recent
    // projects" widget an approximate count is fine. When a project has more
    // than the cap, variableCount saturates and variableCountCapped is true
    // (render as e.g. "100+").
    const VARIABLE_COUNT_CAP = 100;
    const projectsWithStats = await Promise.all(
      projects.map(async (project) => {
        const projectVars = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .take(VARIABLE_COUNT_CAP);
        const variableCount = projectVars.filter(
          (variable) => variable.deletedAt === undefined
        ).length;

        return {
          _id: project._id,
          name: project.name,
          slug: project.slug,
          description: project.description,
          icon: project.icon,
          color: project.color,
          createdAt: project.createdAt,
          variableCount,
          variableCountCapped: projectVars.length >= VARIABLE_COUNT_CAP,
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
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
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
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter((p) => p.deletedAt === undefined);

    const projectCount = projects.length;
    const projectIds = new Set(projects.map((project) => project._id));

    // Check if any variables exist in org projects
    let hasVariables = false;
    for (const projectId of projectIds) {
      const vars = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(50);

      if (vars.some((variable) => variable.deletedAt === undefined)) {
        hasVariables = true;
        break;
      }
    }

    // Check if any team members have been invited (more than 1 member)
    const memberCount = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .take(2);

    // Check if any project access tokens exist (CLI/IDE integration) for org projects
    let hasIntegrations = false;
    for (const projectId of projectIds) {
      const accessTokens = await ctx.db
        .query("projectAccess")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(50);

      if (accessTokens.some((token) => token.isActive)) {
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

/**
 * Unified analytics query for the dashboard analytics page.
 * Combines audit log summary + per-project breakdown in a single query
 * to avoid fetching the same audit logs twice.
 */
export const getAnalytics = query({
  args: {
    organizationId: v.id("organizations"),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const requestedDays = args.daysBack ?? 30;

    // Resolve analytics retention limit for this org
    const retentionResolved = await resolveFeatureValue(
      ctx.db,
      args.organizationId,
      "analytics_retention_days"
    );
    const maxRetentionDays = retentionResolved.value as number | null;
    const effectiveDays =
      maxRetentionDays !== null
        ? Math.min(requestedDays, maxRetentionDays)
        : requestedDays;

    const daysBack = effectiveDays;
    const startTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    // Single audit log fetch for both summary + project breakdown. Capped so
    // audit-heavy orgs can't blow the read budget on this window scan. We take
    // the most recent AUDIT_LOG_CAP events (order desc); when the cap is hit the
    // aggregations reflect only the newest events in the window (see
    // `logsCapped` in the return).
    const AUDIT_LOG_CAP = 2000;
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId).gte("createdAt", startTime)
      )
      .order("desc")
      .take(AUDIT_LOG_CAP);

    // Fetch all non-deleted projects
    const allProjects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const projects = allProjects.filter((p) => p.deletedAt === undefined);

    // === Summary aggregations (replaces separate getSummary call) ===
    const actionCounts: Record<string, number> = {};
    const userActivityCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const resourceTypeCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};
    let sensitiveAccessCount = 0;
    let securityEventCount = 0;

    // === Per-project aggregations ===
    const projectCounts: Record<
      string,
      {
        projectName: string;
        eventCount: number;
        variableCreated: number;
        variableUpdated: number;
        variableDeleted: number;
      }
    > = {};

    for (const project of projects) {
      projectCounts[project._id.toString()] = {
        projectName: project.name,
        eventCount: 0,
        variableCreated: 0,
        variableUpdated: 0,
        variableDeleted: 0,
      };
    }

    // Single pass over all logs for both summary + project data
    for (const log of logs) {
      // Summary: action counts
      actionCounts[log.action] = (actionCounts[log.action] ?? 0) + 1;

      // Summary: user activity
      const userIdStr = log.userId.toString();
      userActivityCounts[userIdStr] = (userActivityCounts[userIdStr] ?? 0) + 1;

      // Summary: severity
      if (log.severity) {
        severityCounts[log.severity] = (severityCounts[log.severity] ?? 0) + 1;
      }

      // Summary: resource type
      if (log.resourceType) {
        resourceTypeCounts[log.resourceType] =
          (resourceTypeCounts[log.resourceType] ?? 0) + 1;
      }

      // Summary: daily counts
      const dateKey = new Date(log.createdAt).toISOString().split("T")[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] ?? 0) + 1;

      // Summary: sensitive + security
      if (log.involvesSensitiveData) sensitiveAccessCount++;
      if (log.action.startsWith("security.")) securityEventCount++;

      // Project breakdown
      if (log.projectId) {
        const pid = log.projectId.toString();
        if (!projectCounts[pid]) {
          projectCounts[pid] = {
            projectName: "Deleted Project",
            eventCount: 0,
            variableCreated: 0,
            variableUpdated: 0,
            variableDeleted: 0,
          };
        }
        projectCounts[pid].eventCount++;
        if (log.action === "variable.created")
          projectCounts[pid].variableCreated++;
        else if (log.action === "variable.updated")
          projectCounts[pid].variableUpdated++;
        else if (log.action === "variable.deleted")
          projectCounts[pid].variableDeleted++;
      }
    }

    // Top active users
    const topUserIds = Object.keys(userActivityCounts)
      .sort((a, b) => userActivityCounts[b] - userActivityCounts[a])
      .slice(0, 5);

    const userMap = await batchGetUsers(
      ctx,
      topUserIds.map((id) => id as Id<"users">)
    );

    const topActiveUsers = topUserIds.map((id) => {
      const user = userMap.get(id);
      return {
        userId: id,
        name: user?.name ?? user?.email ?? "Unknown",
        email: user?.email ?? "Unknown",
        actionCount: userActivityCounts[id],
      };
    });

    // Project activity (top 10)
    const entries = Object.values(projectCounts);
    const projectActivity = entries
      .filter((e) => e.eventCount > 0)
      .sort((a, b) => b.eventCount - a.eventCount)
      .slice(0, 10)
      .map((e) => ({
        projectName: e.projectName,
        eventCount: e.eventCount,
      }));

    // Variable changes by project (top 8)
    const variableChangesByProject = entries
      .filter(
        (e) =>
          e.variableCreated > 0 ||
          e.variableUpdated > 0 ||
          e.variableDeleted > 0
      )
      .sort(
        (a, b) =>
          b.variableCreated +
          b.variableUpdated +
          b.variableDeleted -
          (a.variableCreated + a.variableUpdated + a.variableDeleted)
      )
      .slice(0, 8)
      .map((e) => ({
        projectName: e.projectName,
        created: e.variableCreated,
        updated: e.variableUpdated,
        deleted: e.variableDeleted,
      }));

    return {
      // Summary data
      totalEvents: logs.length,
      // True when the audit scan saturated at AUDIT_LOG_CAP; aggregations then
      // cover only the most recent events in the window.
      logsCapped: logs.length >= AUDIT_LOG_CAP,
      actionCounts,
      severityCounts,
      resourceTypeCounts,
      dailyCounts,
      topActiveUsers,
      sensitiveAccessCount,
      securityEventCount,
      periodDays: daysBack,
      maxRetentionDays: maxRetentionDays ?? undefined,
      effectiveDays,
      // Project breakdown data
      projectActivity,
      variableChangesByProject,
    };
  },
});
