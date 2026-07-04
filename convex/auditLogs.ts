import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
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

// Read caps. auditLogs is the fastest-growing table (one row per mutation), and
// Convex has no O(1) count, so every org-wide read must be bounded by an index
// range plus a take() cap. Aggregations report `capped: true` when the cap is
// hit so callers can surface an "approximate / showing first N" hint.
const COUNT_CAP = 1000; // countByOrganization
const SUMMARY_CAP = 5000; // getSummary
const REPORT_CAP = 5000; // getComplianceReport
const ALERT_COUNT_CAP = 5000; // getAlertCount

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

    // Push the retention cutoff into the index range so the DB never scans rows
    // older than the retention window.
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return cutoff ? base.gte("createdAt", cutoff) : base;
      })
      .order("desc")
      .take(limit + (args.offset ?? 0));

    const offsetLogs = args.offset ? logs.slice(args.offset) : logs;
    const retainedLogs = offsetLogs.slice(0, limit);

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

/**
 * Cursor-paginated org-wide audit log listing for "load more on scroll".
 *
 * Reads exactly one page at a time via Convex `.paginate()` instead of the
 * offset/take window listByOrganization uses. The retention cutoff is pushed
 * into the by_org_and_created index range so the scan is still bounded — no
 * post-fetch JS filtering that would change which rows land in a page (that
 * would break cursor determinism). Enriches each page row EXACTLY like
 * listByOrganization (same batchGetUsers lookup, same userDisplay spread,
 * same parsedDetails), so the audit page renders identical rows.
 */
export const listByOrganizationPaginated = query({
  args: {
    organizationId: v.id("organizations"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const result = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return cutoff ? base.gte("createdAt", cutoff) : base;
      })
      .order("desc")
      .paginate(args.paginationOpts);

    const userMap = await batchGetUsers(
      ctx,
      result.page.map((l) => l.userId)
    );
    const enrichedPage = result.page.map((log) => {
      const u = userMap.get(log.userId.toString());
      return {
        ...log,
        ...userDisplay(u),
        parsedDetails: log.details ? JSON.parse(log.details) : null,
      };
    });

    return {
      page: enrichedPage,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export const countByOrganization = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    // Push the retention cutoff into the index range so only in-range rows are
    // read, and cap with take() so the read can't grow with org history. For
    // histories larger than COUNT_CAP this returns COUNT_CAP (approximate).
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return cutoff ? base.gte("createdAt", cutoff) : base;
      })
      .take(COUNT_CAP);

    return logs.length;
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

    // Apply retention cutoff via project -> org. The by_project index is not
    // org-scoped, so the cutoff is applied in memory on the bounded result set.
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

    // Apply retention cutoff via variable -> project -> org. The by_variable
    // index is not org-scoped, so the cutoff is applied in memory on the
    // bounded result set.
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
      "account.accessed",
      "permission.granted",
      "permission.revoked",
      "permission.updated",
      "permission.bulk_granted",
      "permission.bulk_revoked",
      "account.permission_granted",
      "account.permission_updated",
      "account.permission_revoked",
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

    // Push the retention cutoff into the index range, then take a bounded
    // window and narrow to security actions in memory.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return cutoff ? base.gte("createdAt", cutoff) : base;
      })
      .order("desc")
      .take(1000);

    let securityLogs = logs.filter((log) =>
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
      "account.accessed",
    ];

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    // The retention cutoff and an explicit startTime both bound the low end of
    // the createdAt range; use the larger of the two in the index range so the
    // DB reads as few rows as possible.
    const lowerBound =
      args.startTime != null && cutoff != null
        ? Math.max(args.startTime, cutoff)
        : (args.startTime ?? cutoff);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return lowerBound != null ? base.gte("createdAt", lowerBound) : base;
      })
      .order("desc")
      .take(2000);

    const sensitiveAccessLogs = logs.filter((log) => {
      // Check if it's an access action
      if (!accessActions.includes(log.action)) return false;

      // Filter by upper time bound if specified (lower bound handled by index)
      if (args.endTime && log.createdAt > args.endTime) return false;

      // Filter for sensitive data only
      if (log.involvesSensitiveData !== true) {
        // Check details for sensitive flag
        try {
          const details = log.details ? JSON.parse(log.details) : {};
          if (!details.isSensitive) return false;
        } catch (err) {
          console.error("auditLogs.getSensitiveAccessLogs.parseDetailsFailed", {
            auditLogId: log._id,
            organizationId: args.organizationId,
            error: String(err),
          });
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
      "account.permission_granted",
      "account.permission_updated",
      "account.permission_revoked",
    ];

    const cutoff = await getRetentionCutoff(ctx.db, args.organizationId);

    const lowerBound =
      args.startTime != null && cutoff != null
        ? Math.max(args.startTime, cutoff)
        : (args.startTime ?? cutoff);

    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return lowerBound != null ? base.gte("createdAt", lowerBound) : base;
      })
      .order("desc")
      .take(2000);

    const permissionLogs = logs.filter((log) => {
      if (!permissionActions.includes(log.action)) return false;
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
          } catch (err) {
            console.error("auditLogs.listWithDetails.parseTargetUserFailed", {
              auditLogId: log._id,
              error: String(err),
            });
            // Ignore parse errors — targetUserInfo stays null
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

    // Both bounds of the time range are served by the by_org_and_created index
    // range instead of a post-scan db `.filter`.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("createdAt", effectiveStartTime)
          .lte("createdAt", args.endTime)
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

    // Serve the time window from the index range and cap the read so it can't
    // grow unbounded with org history. `capped` signals the aggregation ran on
    // a truncated (most-recent) window.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q.eq("organizationId", args.organizationId).gte("createdAt", startTime)
      )
      .order("desc")
      .take(SUMMARY_CAP);

    const capped = logs.length >= SUMMARY_CAP;

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
      capped,
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

    // Serve the reporting window from the index range and cap the read.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("createdAt", effectiveStartTime)
          .lte("createdAt", args.endTime)
      )
      .order("desc")
      .take(REPORT_CAP);

    const capped = logs.length >= REPORT_CAP;

    // Calculate metrics
    const variableAccessLogs = logs.filter(
      (l) =>
        l.action === "variable.accessed" ||
        l.action === "variable.exported" ||
        l.action === "variable.copied" ||
        l.action === "account.accessed"
    );
    const permissionChangeLogs = logs.filter(
      (l) =>
        l.action.startsWith("permission.") ||
        l.action.startsWith("account.permission_")
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
      capped,
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

    // Serve both time bounds from the index range instead of a post-scan
    // db `.filter`.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("createdAt", effectiveStartTime)
          .lte("createdAt", args.endTime)
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

    // Account-share events (and other resource types) carry no variableId, so
    // fall back to the variableKey stored in the details JSON to keep the
    // export's resource column populated.
    const variableKeyFromDetails = (
      details: string | undefined
    ): string | null => {
      if (!details) return null;
      try {
        const parsed = JSON.parse(details);
        return typeof parsed?.variableKey === "string"
          ? parsed.variableKey
          : null;
      } catch (err) {
        console.error("auditLogs.exportLogs.parseVariableKeyFailed", {
          field: "details.variableKey",
          error: String(err),
        });
        return null;
      }
    };

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
          : variableKeyFromDetails(log.details),
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

    // Push the retention cutoff into the index range, then narrow to
    // alert-severity events in memory on the bounded window.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) => {
        const base = q.eq("organizationId", args.organizationId);
        return cutoff ? base.gte("createdAt", cutoff) : base;
      })
      .order("desc")
      .take(500);

    const alertLogs = logs.filter(
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

    // Serve the "since" lower bound from the index range and cap the read so
    // it can't grow unbounded.
    const logs = await ctx.db
      .query("auditLogs")
      .withIndex("by_org_and_created", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .gte("createdAt", effectiveSince)
      )
      .order("desc")
      .take(ALERT_COUNT_CAP);

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
      capped: logs.length >= ALERT_COUNT_CAP,
    };
  },
});
