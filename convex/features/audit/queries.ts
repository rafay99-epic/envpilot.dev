import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { batchGetUsers, userDisplay } from "../../lib/users";
import { getRetentionCutoff } from "./helpers";

/**
 * Comprehensive Audit Log Queries
 *
 * Provides audit trail functionality for security compliance including:
 * - Access tracking for environment variables
 * - Permission change history
 * - Sensitive operation logging
 * - Security event monitoring
 */

// Read caps. auditLogs is the fastest-growing table (one row per mutation), and
// Convex has no O(1) count, so every org-wide read must be bounded by an index
// range plus a take() cap. Aggregations report `capped: true` when the cap is
// hit so callers can surface an "approximate / showing first N" hint.
const COUNT_CAP = 1000; // countByOrganization

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
