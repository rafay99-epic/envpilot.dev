import { v } from "convex/values";
import { query } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";
import { batchGetUsers, userDisplay } from "./helpers";
import { resolveFeatureValue } from "./featureRegistry";

/**
 * Comprehensive Audit Log Queries
 *
 * Provides audit trail functionality for security compliance including:
 * - Access tracking for environment variables
 * - Permission change history
 * - Sensitive operation logging
 * - Security event monitoring
 */

/**
 * Get the audit log retention cutoff timestamp for an organization.
 * Returns null if no retention limit applies (unlimited).
 */
async function getRetentionCutoff(
  db: any,
  organizationId: Id<"organizations">
): Promise<number | null> {
  const resolved = await resolveFeatureValue(
    db,
    organizationId,
    "audit_log_retention_days"
  );
  const days = resolved.value as number | null;
  if (days === null) return null; // unlimited
  return Date.now() - days * 24 * 60 * 60 * 1000;
}
// ==========================================
// BASIC QUERIES
// ==========================================

export const listByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(limit + (args.offset ?? 0));

    const offsetLogs = args.offset ? logs.slice(args.offset) : logs;
    const resultLogs = offsetLogs.slice(0, limit);

    // Apply audit log retention cutoff
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const retainedLogs = cutoff
      ? resultLogs.filter((log) => log.createdAt >= cutoff)
      : resultLogs;

    const userMap = await batchGetUsers(
      ctx,
      retainedLogs.map((l) => l.userId)
    );
    return retainedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

export const countByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;
    return retainedLogs.length;
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(args.limit ?? 50);

    // Apply retention cutoff via project -> org
    const project = await ctx.db.get(args.projectId);
    const cutoff = project
      ? await getRetentionCutoff(ctx.db, project.organizationId)
      : null;
    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;

    const userMap = await batchGetUsers(
      ctx,
      retainedLogs.map((l) => l.userId)
    );
    return retainedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

export const listByVariable = query({
  args: {
    variableId: v.id("environmentVariables"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .take(args.limit ?? 50);

    // Apply retention cutoff via variable -> project -> org
    const variable = await ctx.db.get(args.variableId);
    const project = variable ? await ctx.db.get(variable.projectId) : null;
    const cutoff = project
      ? await getRetentionCutoff(ctx.db, project.organizationId)
      : null;
    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;

    const userMap = await batchGetUsers(
      ctx,
      retainedLogs.map((l) => l.userId)
    );
    return retainedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

export const listByUser = query({
  args: {
    userId: v.id("users"),
    organizationId: v.optional(v.id("organizations")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logsQuery = ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId));

    if (args.organizationId) {
      logsQuery = logsQuery.filter((q) =>
        q.eq(q.field("organizationId"), args.organizationId)
      );
    }

    const logs = await logsQuery.order("desc").take(args.limit ?? 50);

    // Apply retention cutoff if org context available
    let retainedLogs = logs;
    if (args.organizationId) {
      const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
      if (cutoff) retainedLogs = logs.filter((l) => l.createdAt >= cutoff);
    }

    const logsWithDetails = await Promise.all(
      retainedLogs.map(async (log) => {
        const org = await ctx.db.get(log.organizationId);
        const project = log.projectId ? await ctx.db.get(log.projectId) : null;
        return {
          ...log,
          organizationName: org?.name ?? "Unknown",
          projectName: project?.name,
          parsedDetails: log.details ? JSON.parse(log.details) : null,
        };
      })
    );

    return logsWithDetails;
  },
});

export const listByAction = query({
  args: {
    organizationId: v.id("organizations"),
    action: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("action"), args.action))
      .order("desc")
      .take(args.limit ?? 50);

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;

    const userMap = await batchGetUsers(
      ctx,
      retainedLogs.map((l) => l.userId)
    );
    return retainedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

// ==========================================
// SECURITY & COMPLIANCE QUERIES
// ==========================================

export const listSecurityEvents = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
    includeSeverity: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const securityActions = [
      "variable.accessed",
      "variable.exported",
      "variable.copied",
      "permission.granted",
      "permission.revoked",
      "permission.updated",
      "permission.bulk_granted",
      "permission.bulk_revoked",
      "access.token_created",
      "access.token_revoked",
      "access.token_used",
      "access.extension_linked",
      "access.extension_unlinked",
      "security.access_denied",
      "security.unauthorized_attempt",
      "security.permission_check_failed",
      "security.token_validation_failed",
      "security.rate_limit_exceeded",
      "security.suspicious_activity",
    ];

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(1000);

    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;
    let securityLogs = retainedLogs.filter((log) =>
      securityActions.includes(log.action)
    );

    // Filter by severity if specified
    if (args.includeSeverity && args.includeSeverity.length > 0) {
      securityLogs = securityLogs.filter(
        (log) => log.severity && args.includeSeverity!.includes(log.severity)
      );
    }

    const limitedLogs = securityLogs.slice(0, args.limit ?? 100);

    const userMap = await batchGetUsers(
      ctx,
      limitedLogs.map((l) => l.userId)
    );
    return limitedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

/**
 * List all access events for sensitive variables
 * Essential for security compliance auditing
 */
export const listSensitiveDataAccess = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const accessActions = [
      "variable.accessed",
      "variable.exported",
      "variable.copied",
    ];

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const logsQuery = ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc");

    const logs = await logsQuery.take(2000);
    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;

    const sensitiveAccessLogs = retainedLogs.filter((log) => {
      // Check if it's an access action
      if (!accessActions.includes(log.action)) return false;

      // Filter by time range if specified
      if (args.startTime && log.createdAt < args.startTime) return false;
      if (args.endTime && log.createdAt > args.endTime) return false;

      // Filter for sensitive data only
      if (log.involvesSensitiveData !== true) {
        // Check details for sensitive flag
        try {
          const details = log.details ? JSON.parse(log.details) : {};
          if (!details.isSensitive) return false;
        } catch {
          return false;
        }
      }

      return true;
    });

    const limitedLogs = sensitiveAccessLogs.slice(0, args.limit ?? 100);

    const userMap = await batchGetUsers(
      ctx,
      limitedLogs.map((l) => l.userId)
    );
    const varIds = limitedLogs
      .map((l) => l.variableId)
      .filter(Boolean) as Id<"environmentVariables">[];
    const projIds = limitedLogs
      .map((l) => l.projectId)
      .filter(Boolean) as Id<"projects">[];
    const [vars, projs] = await Promise.all([
      Promise.all(
        [...new Set(varIds.map(String))].map((id) =>
          ctx.db.get(id as Id<"environmentVariables">)
        )
      ),
      Promise.all(
        [...new Set(projIds.map(String))].map((id) =>
          ctx.db.get(id as Id<"projects">)
        )
      ),
    ]);
    const varMap = new Map(
      vars.filter(Boolean).map((v) => [v!._id.toString(), v!])
    );
    const projMap = new Map(
      projs.filter(Boolean).map((p) => [p!._id.toString(), p!])
    );

    return limitedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        variableKey:
          (log.variableId
            ? varMap.get(log.variableId.toString())?.key
            : null) ?? "Unknown",
        projectName:
          (log.projectId
            ? projMap.get(log.projectId.toString())?.name
            : null) ?? "Unknown",
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

/**
 * List all permission changes for compliance reporting
 */
export const listPermissionChanges = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.optional(v.number()),
    endTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const permissionActions = [
      "permission.granted",
      "permission.revoked",
      "permission.updated",
      "permission.expired",
      "permission.bulk_granted",
      "permission.bulk_revoked",
    ];

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(2000);

    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;
    const permissionLogs = retainedLogs.filter((log) => {
      if (!permissionActions.includes(log.action)) return false;
      if (args.startTime && log.createdAt < args.startTime) return false;
      if (args.endTime && log.createdAt > args.endTime) return false;
      return true;
    });

    const limitedLogs = permissionLogs.slice(0, args.limit ?? 100);

    const logsWithDetails = await Promise.all(
      limitedLogs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        const variable = log.variableId
          ? await ctx.db.get(log.variableId)
          : null;
        const project = log.projectId ? await ctx.db.get(log.projectId) : null;

        // Parse details to get target user info
        let targetUserInfo = null;
        if (log.details) {
          try {
            const details = JSON.parse(log.details);
            if (
              details.grantedTo ||
              details.revokedFrom ||
              details.targetUser
            ) {
              const targetUserId =
                details.grantedTo || details.revokedFrom || details.targetUser;
              const targetUser = await ctx.db.get(targetUserId as Id<"users">);
              targetUserInfo = targetUser
                ? {
                    _id: targetUser._id,
                    name: targetUser.name,
                    email: targetUser.email,
                  }
                : null;
            }
          } catch {
            // Ignore parse errors
          }
        }

        return {
          ...log,
          userName: user?.name ?? user?.email ?? "Unknown",
          userEmail: user?.email ?? "Unknown",
          variableKey: variable?.key ?? "Unknown",
          projectName: project?.name ?? "Unknown",
          targetUser: targetUserInfo,
          parsedDetails: log.details ? JSON.parse(log.details) : null,
        };
      })
    );

    return logsWithDetails;
  },
});

export const listByTimeRange = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.number(),
    endTime: v.number(),
    limit: v.optional(v.number()),
    actionFilter: v.optional(v.array(v.string())),
    severityFilter: v.optional(v.array(v.string())),
    resourceTypeFilter: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const effectiveStartTime = cutoff
      ? Math.max(args.startTime, cutoff)
      : args.startTime;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), effectiveStartTime),
          q.lte(q.field("createdAt"), args.endTime)
        )
      )
      .order("desc")
      .take(args.limit ?? 500);

    // Apply additional filters
    let filteredLogs = logs;

    if (args.actionFilter && args.actionFilter.length > 0) {
      filteredLogs = filteredLogs.filter((log) =>
        args.actionFilter!.includes(log.action)
      );
    }

    if (args.severityFilter && args.severityFilter.length > 0) {
      filteredLogs = filteredLogs.filter(
        (log) => log.severity && args.severityFilter!.includes(log.severity)
      );
    }

    if (args.resourceTypeFilter && args.resourceTypeFilter.length > 0) {
      filteredLogs = filteredLogs.filter(
        (log) =>
          log.resourceType &&
          args.resourceTypeFilter!.includes(log.resourceType)
      );
    }

    const userMap = await batchGetUsers(
      ctx,
      filteredLogs.map((l) => l.userId)
    );
    return filteredLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

// ==========================================
// ANALYTICS & SUMMARY QUERIES
// ==========================================

export const getSummary = query({
  args: {
    organizationId: v.id("organizations"),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysBack = args.daysBack ?? 30;
    const rawStartTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const startTime = cutoff ? Math.max(rawStartTime, cutoff) : rawStartTime;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.gte(q.field("createdAt"), startTime))
      .collect();

    const actionCounts: Record<string, number> = {};
    const userActivityCounts: Record<string, number> = {};
    const severityCounts: Record<string, number> = {};
    const resourceTypeCounts: Record<string, number> = {};
    const dailyCounts: Record<string, number> = {};

    let sensitiveAccessCount = 0;
    let securityEventCount = 0;

    for (const log of logs) {
      // Action counts
      actionCounts[log.action] = (actionCounts[log.action] ?? 0) + 1;

      // User activity counts
      const userIdStr = log.userId.toString();
      userActivityCounts[userIdStr] = (userActivityCounts[userIdStr] ?? 0) + 1;

      // Severity counts
      if (log.severity) {
        severityCounts[log.severity] = (severityCounts[log.severity] ?? 0) + 1;
      }

      // Resource type counts
      if (log.resourceType) {
        resourceTypeCounts[log.resourceType] =
          (resourceTypeCounts[log.resourceType] ?? 0) + 1;
      }

      // Daily counts
      const dateKey = new Date(log.createdAt).toISOString().split("T")[0];
      dailyCounts[dateKey] = (dailyCounts[dateKey] ?? 0) + 1;

      // Sensitive data access count
      if (log.involvesSensitiveData) {
        sensitiveAccessCount++;
      }

      // Security event count
      if (log.action.startsWith("security.")) {
        securityEventCount++;
      }
    }

    // Top active users
    const userIds = Object.keys(userActivityCounts);
    const topUserIds = userIds
      .sort((a, b) => userActivityCounts[b] - userActivityCounts[a])
      .slice(0, 5);

    const topUsers = await Promise.all(
      topUserIds.map(async (id) => {
        const user = await ctx.db.get(id as Id<"users">);
        return {
          userId: id,
          name: user?.name ?? user?.email ?? "Unknown",
          email: user?.email ?? "Unknown",
          actionCount: userActivityCounts[id],
        };
      })
    );

    return {
      totalEvents: logs.length,
      actionCounts,
      severityCounts,
      resourceTypeCounts,
      dailyCounts,
      topActiveUsers: topUsers,
      sensitiveAccessCount,
      securityEventCount,
      periodDays: daysBack,
    };
  },
});

/**
 * Get compliance report data
 * Aggregates audit data for compliance reporting requirements
 */
export const getComplianceReport = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.number(),
    endTime: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const effectiveStartTime = cutoff
      ? Math.max(args.startTime, cutoff)
      : args.startTime;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), effectiveStartTime),
          q.lte(q.field("createdAt"), args.endTime)
        )
      )
      .collect();

    // Calculate metrics
    const variableAccessLogs = logs.filter(
      (l) =>
        l.action === "variable.accessed" ||
        l.action === "variable.exported" ||
        l.action === "variable.copied"
    );
    const permissionChangeLogs = logs.filter((l) =>
      l.action.startsWith("permission.")
    );
    const securityEventLogs = logs.filter((l) =>
      l.action.startsWith("security.")
    );
    const sensitiveAccessLogs = logs.filter((l) => l.involvesSensitiveData);

    // Unique users who accessed data
    const uniqueAccessUsers = new Set(
      variableAccessLogs.map((l) => l.userId.toString())
    );

    // Unique variables accessed
    const uniqueVariablesAccessed = new Set(
      variableAccessLogs
        .filter((l) => l.variableId)
        .map((l) => l.variableId!.toString())
    );

    // Access by IP distribution
    const accessByIp: Record<string, number> = {};
    for (const log of variableAccessLogs) {
      if (log.ipAddress) {
        accessByIp[log.ipAddress] = (accessByIp[log.ipAddress] ?? 0) + 1;
      }
    }

    // Security events by type
    const securityEventsByType: Record<string, number> = {};
    for (const log of securityEventLogs) {
      securityEventsByType[log.action] =
        (securityEventsByType[log.action] ?? 0) + 1;
    }

    return {
      period: {
        start: args.startTime,
        end: args.endTime,
      },
      summary: {
        totalEvents: logs.length,
        variableAccessCount: variableAccessLogs.length,
        permissionChangeCount: permissionChangeLogs.length,
        securityEventCount: securityEventLogs.length,
        sensitiveDataAccessCount: sensitiveAccessLogs.length,
        uniqueUsersAccessingData: uniqueAccessUsers.size,
        uniqueVariablesAccessed: uniqueVariablesAccessed.size,
      },
      accessByIp,
      securityEventsByType,
      complianceStatus: {
        auditTrailComplete: true,
        sensitiveDataTracked:
          sensitiveAccessLogs.length > 0 || variableAccessLogs.length === 0,
        permissionChangesLogged: true,
        securityEventsMonitored: true,
      },
    };
  },
});

// ==========================================
// EXPORT QUERIES
// ==========================================

/**
 * Get audit logs formatted for export
 */
export const getForExport = query({
  args: {
    organizationId: v.id("organizations"),
    startTime: v.number(),
    endTime: v.number(),
    format: v.union(v.literal("csv"), v.literal("json")),
    includeDetails: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const effectiveStartTime = cutoff
      ? Math.max(args.startTime, cutoff)
      : args.startTime;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) =>
        q.and(
          q.gte(q.field("createdAt"), effectiveStartTime),
          q.lte(q.field("createdAt"), args.endTime)
        )
      )
      .order("desc")
      .take(10000); // Limit for performance

    const userMap = await batchGetUsers(
      ctx,
      logs.map((l) => l.userId)
    );
    const projIds = [
      ...new Set(
        logs
          .map((l) => l.projectId)
          .filter(Boolean)
          .map(String)
      ),
    ];
    const varIds = [
      ...new Set(
        logs
          .map((l) => l.variableId)
          .filter(Boolean)
          .map(String)
      ),
    ];
    const [projs, vars] = await Promise.all([
      Promise.all(projIds.map((id) => ctx.db.get(id as Id<"projects">))),
      Promise.all(
        varIds.map((id) => ctx.db.get(id as Id<"environmentVariables">))
      ),
    ]);
    const projMap = new Map(
      projs.filter(Boolean).map((p) => [p!._id.toString(), p!])
    );
    const varMap = new Map(
      vars.filter(Boolean).map((v) => [v!._id.toString(), v!])
    );

    const exportData = logs.map((log) => {
      const u = userMap.get(log.userId.toString());
      const baseRecord = {
        timestamp: new Date(log.createdAt).toISOString(),
        action: log.action,
        ...userDisplay(u),
        projectName: log.projectId
          ? (projMap.get(log.projectId.toString())?.name ?? null)
          : null,
        variableKey: log.variableId
          ? (varMap.get(log.variableId.toString())?.key ?? null)
          : null,
        severity: log.severity ?? "info",
        resourceType: log.resourceType ?? null,
        ipAddress: log.ipAddress ?? null,
        involvesSensitiveData: log.involvesSensitiveData ?? false,
      };

      if (args.includeDetails && log.details) {
        return { ...baseRecord, details: JSON.parse(log.details) };
      }

      return baseRecord;
    });

    return {
      format: args.format,
      recordCount: exportData.length,
      data: exportData,
    };
  },
});

// ==========================================
// REAL-TIME MONITORING
// ==========================================

/**
 * Get recent critical/warning events for dashboard alerts
 */
export const getRecentAlerts = query({
  args: {
    organizationId: v.id("organizations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .order("desc")
      .take(500);

    const retainedLogs = cutoff
      ? logs.filter((l) => l.createdAt >= cutoff)
      : logs;
    const alertLogs = retainedLogs.filter(
      (log) => log.severity === "critical" || log.severity === "warning"
    );

    const limitedLogs = alertLogs.slice(0, limit);

    const userMap = await batchGetUsers(
      ctx,
      limitedLogs.map((l) => l.userId)
    );
    return limitedLogs.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });
  },
});

/**
 * Get count of unread/new alerts since a given timestamp
 */
export const getAlertCount = query({
  args: {
    organizationId: v.id("organizations"),
    since: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sinceTime = args.since ?? Date.now() - 24 * 60 * 60 * 1000; // Last 24 hours by default
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const effectiveSince = cutoff ? Math.max(sinceTime, cutoff) : sinceTime;

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.gte(q.field("createdAt"), effectiveSince))
      .collect();

    const criticalCount = logs.filter(
      (log) => log.severity === "critical"
    ).length;
    const warningCount = logs.filter(
      (log) => log.severity === "warning"
    ).length;
    const securityCount = logs.filter((log) =>
      log.action.startsWith("security.")
    ).length;

    return {
      total: criticalCount + warningCount,
      critical: criticalCount,
      warning: warningCount,
      securityEvents: securityCount,
    };
  },
});
