import { v } from "convex/values";
import { query } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { batchGetUsers, userDisplay } from "../../helpers";
import { getRetentionCutoff } from "./helpers";

// Read caps. auditLogs is the fastest-growing table (one row per mutation), and
// Convex has no O(1) count, so every org-wide read must be bounded by an index
// range plus a take() cap. Aggregations report `capped: true` when the cap is
// hit so callers can surface an "approximate / showing first N" hint.
const SUMMARY_CAP = 5000; // getSummary
const REPORT_CAP = 5000; // getComplianceReport

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
