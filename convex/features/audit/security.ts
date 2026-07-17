import { v } from "convex/values";
import { query } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { batchGetUsers, userDisplay } from "../../lib/users";
import { getRetentionCutoff, assertAuditAccess } from "./helpers";

// Read caps. auditLogs is the fastest-growing table (one row per mutation), and
// Convex has no O(1) count, so every org-wide read must be bounded by an index
// range plus a take() cap. Aggregations report `capped: true` when the cap is
// hit so callers can surface an "approximate / showing first N" hint.
const ALERT_COUNT_CAP = 5000; // getAlertCount

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
    await assertAuditAccess(ctx, args.organizationId);
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
    await assertAuditAccess(ctx, args.organizationId);
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
    await assertAuditAccess(ctx, args.organizationId);
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
    await assertAuditAccess(ctx, args.organizationId);
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
    await assertAuditAccess(ctx, args.organizationId);
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
