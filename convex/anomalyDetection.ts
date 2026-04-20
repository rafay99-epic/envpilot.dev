import { v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";
import { checkBooleanFeature } from "./featureRegistry";

/**
 * Anomaly Detection Module
 *
 * A security intelligence layer that monitors audit logs for unusual
 * access patterns and alerts users/admins via email.
 *
 * Detection rules (v1):
 *   1. new_ip — Access from an IP not seen in 30 days
 *   2. off_hours — Access outside typical working hours
 *   3. first_prod_bulk_pull — First-ever production export
 *   4. velocity_spike — 5x more accesses in 1hr than average
 *   5. new_device_sensitive — New UA + sensitive data
 *   6. cross_org_burst — 3+ orgs accessed within 5 minutes
 */

// ==========================================
// SEED DATA — Default anomaly detection rules
// ==========================================

const DEFAULT_ANOMALY_RULES = [
  {
    ruleId: "new_ip",
    displayName: "New IP Address",
    description:
      "Detects access from an IP address not seen in the user's last 30 days of activity.",
    isEnabled: true,
    severity: "warning" as const,
    thresholds: JSON.stringify({}),
    minHistoryDays: 7,
    emailAlertEnabled: true,
    alertCooldownMinutes: 240,
  },
  {
    ruleId: "off_hours",
    displayName: "Off-Hours Access",
    description:
      "Detects access outside the user's typical working hours (with configurable buffer).",
    isEnabled: true,
    severity: "warning" as const,
    thresholds: JSON.stringify({ bufferHours: 2 }),
    minHistoryDays: 14,
    emailAlertEnabled: false,
    alertCooldownMinutes: 480,
  },
  {
    ruleId: "first_prod_bulk_pull",
    displayName: "First Production Bulk Export",
    description:
      "Detects when a user who has never exported production secrets performs a production export.",
    isEnabled: true,
    severity: "critical" as const,
    thresholds: JSON.stringify({}),
    minHistoryDays: 0,
    emailAlertEnabled: true,
    alertCooldownMinutes: 60,
  },
  {
    ruleId: "velocity_spike",
    displayName: "Access Velocity Spike",
    description:
      "Detects when a user's access rate in a 1-hour window exceeds 5x their average hourly rate.",
    isEnabled: true,
    severity: "warning" as const,
    thresholds: JSON.stringify({ velocityMultiplier: 5, windowMinutes: 60 }),
    minHistoryDays: 7,
    emailAlertEnabled: true,
    alertCooldownMinutes: 120,
  },
  {
    ruleId: "new_device_sensitive",
    displayName: "New Device + Sensitive Data",
    description:
      "Detects when sensitive data is accessed from an unrecognized device/user agent.",
    isEnabled: true,
    severity: "info" as const,
    thresholds: JSON.stringify({}),
    minHistoryDays: 7,
    emailAlertEnabled: false,
    alertCooldownMinutes: 1440,
  },
  {
    ruleId: "cross_org_burst",
    displayName: "Cross-Organization Burst",
    description:
      "Detects when a user accesses 3+ organizations within a 5-minute window.",
    isEnabled: true,
    severity: "critical" as const,
    thresholds: JSON.stringify({ windowMinutes: 5, minOrgs: 3 }),
    minHistoryDays: 0,
    emailAlertEnabled: true,
    alertCooldownMinutes: 60,
  },
];

// ==========================================
// INTERNAL MUTATIONS (Cron + Scheduler)
// ==========================================

/**
 * Seed default anomaly rules (idempotent upsert).
 * Called via admin migration panel.
 */
export const seedAnomalyRules = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const rule of DEFAULT_ANOMALY_RULES) {
      const existing = await ctx.db
        .query("anomalyRules")
        .withIndex("by_rule_id", (q) => q.eq("ruleId", rule.ruleId))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("anomalyRules", {
        ...rule,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created, skipped, total: DEFAULT_ANOMALY_RULES.length };
  },
});

/**
 * Build user access baselines from audit log data.
 * Runs hourly via cron. Scans all orgs with anomaly_detection enabled,
 * computes rolling 30-day behavioral profiles for each user.
 */
export const buildBaselines = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Get all organizations
    const orgs = await ctx.db.query("organizations").collect();
    let baselinesUpdated = 0;
    let orgsProcessed = 0;

    for (const org of orgs) {
      // Check if anomaly detection is enabled for this org
      const gate = await checkBooleanFeature(
        ctx.db,
        org._id,
        "anomaly_detection"
      );
      if (!gate.allowed) continue;
      orgsProcessed++;

      // Get all members of this org
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      for (const member of members) {
        // Get audit logs for this user in this org (last 30 days)
        const logs = await ctx.db
          .query("auditLogs")
          .withIndex("by_user_and_created", (q) =>
            q.eq("userId", member.userId).gte("createdAt", thirtyDaysAgo)
          )
          .collect();

        // Filter to this org's logs
        const orgLogs = logs.filter((log) => log.organizationId === org._id);

        if (orgLogs.length === 0) continue;

        // Compute baseline metrics
        const ips = new Set<string>();
        const userAgents = new Set<string>();
        const hours: number[] = [];
        const days = new Set<number>();
        const environments = new Set<string>();
        const dates = new Set<string>();
        let hasPulledProd = false;

        for (const log of orgLogs) {
          if (log.ipAddress && log.ipAddress !== "unknown") {
            ips.add(log.ipAddress);
          }
          if (log.userAgent) {
            userAgents.add(log.userAgent);
          }

          const date = new Date(log.createdAt);
          hours.push(date.getUTCHours());
          days.add(date.getUTCDay());
          dates.add(date.toISOString().slice(0, 10));

          // Check for production export
          if (log.action === "variable.exported" && log.details) {
            try {
              const details = JSON.parse(
                typeof log.details === "string"
                  ? log.details
                  : JSON.stringify(log.details)
              );
              if (details.environment === "production") {
                hasPulledProd = true;
              }
              if (details.environment) {
                environments.add(details.environment);
              }
            } catch {
              // Skip if details can't be parsed
            }
          }
        }

        // Compute typical hours (10th/90th percentile)
        const sortedHours = [...hours].sort((a, b) => a - b);
        const p10Index = Math.floor(sortedHours.length * 0.1);
        const p90Index = Math.floor(sortedHours.length * 0.9);
        const typicalHoursStart =
          sortedHours.length > 0 ? sortedHours[p10Index] : 8;
        const typicalHoursEnd =
          sortedHours.length > 0 ? sortedHours[p90Index] : 19;

        // Compute typical days (days with >= 5% of total accesses)
        const dayCount: Record<number, number> = {};
        for (const h of hours) {
          const d = new Date(orgLogs[hours.indexOf(h)].createdAt).getUTCDay();
          dayCount[d] = (dayCount[d] || 0) + 1;
        }
        // Recompute day counts properly
        const dayCounts: Record<number, number> = {};
        for (const log of orgLogs) {
          const d = new Date(log.createdAt).getUTCDay();
          dayCounts[d] = (dayCounts[d] || 0) + 1;
        }
        const threshold = orgLogs.length * 0.05;
        const typicalDays = Object.entries(dayCounts)
          .filter(([, count]) => count >= threshold)
          .map(([day]) => Number(day));

        const daysOfHistory = dates.size;
        const avgDailyAccesses =
          daysOfHistory > 0 ? orgLogs.length / daysOfHistory : 0;

        // Upsert baseline
        const existingBaseline = await ctx.db
          .query("accessBaselines")
          .withIndex("by_user_and_org", (q) =>
            q.eq("userId", member.userId).eq("organizationId", org._id)
          )
          .first();

        const baselineData = {
          userId: member.userId,
          organizationId: org._id,
          knownIps: [...ips].slice(0, 50),
          knownUserAgents: [...userAgents].slice(0, 20),
          typicalHoursStart,
          typicalHoursEnd,
          typicalDays,
          accessedEnvironments: [...environments],
          hasPulledProd,
          avgDailyAccesses: Math.round(avgDailyAccesses * 100) / 100,
          totalAccessCount: orgLogs.length,
          daysOfHistory,
          lastUpdated: now,
          createdAt: existingBaseline?.createdAt ?? now,
        };

        if (existingBaseline) {
          await ctx.db.patch(existingBaseline._id, baselineData);
        } else {
          await ctx.db.insert("accessBaselines", baselineData);
        }
        baselinesUpdated++;
      }
    }

    return { orgsProcessed, baselinesUpdated };
  },
});

/**
 * Detect anomalies after an audit log entry is created.
 * Scheduled via ctx.scheduler.runAfter(0, ...) from audit helpers.
 * Runs in a separate transaction — never adds latency to the user's mutation.
 */
export const detectAnomaliesAfterAudit = internalMutation({
  args: {
    auditLogId: v.id("auditLogs"),
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    action: v.string(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    involvesSensitiveData: v.optional(v.boolean()),
    createdAt: v.number(),
    details: v.string(),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    // Check if anomaly detection is enabled for this org
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "anomaly_detection"
    );
    if (!gate.allowed) return { detected: 0 };

    // Get all enabled rules
    const rules = await ctx.db
      .query("anomalyRules")
      .withIndex("by_enabled", (q) => q.eq("isEnabled", true))
      .collect();

    if (rules.length === 0) return { detected: 0 };

    // Get user's baseline for this org
    const baseline = await ctx.db
      .query("accessBaselines")
      .withIndex("by_user_and_org", (q) =>
        q.eq("userId", args.userId).eq("organizationId", args.organizationId)
      )
      .first();

    let detected = 0;
    const now = args.createdAt;

    // Parse details once
    let parsedDetails: Record<string, unknown> = {};
    try {
      parsedDetails = JSON.parse(args.details);
    } catch {
      // Skip if details can't be parsed
    }

    for (const rule of rules) {
      // Skip if insufficient history
      if (
        rule.minHistoryDays > 0 &&
        (!baseline || baseline.daysOfHistory < rule.minHistoryDays)
      ) {
        continue;
      }

      // Check cooldown — skip if recent alert exists for same rule+user
      const cooldownCutoff = now - rule.alertCooldownMinutes * 60 * 1000;
      const recentAlert = await ctx.db
        .query("anomalyEvents")
        .withIndex("by_rule_and_user", (q) =>
          q.eq("ruleId", rule.ruleId).eq("userId", args.userId)
        )
        .order("desc")
        .first();

      if (recentAlert && recentAlert.detectedAt > cooldownCutoff) {
        continue;
      }

      // Run the rule
      const anomalyDetails = await evaluateRule(
        ctx,
        rule.ruleId,
        rule.thresholds,
        args,
        baseline,
        parsedDetails
      );

      if (anomalyDetails) {
        // Create anomaly event
        await ctx.db.insert("anomalyEvents", {
          organizationId: args.organizationId,
          userId: args.userId,
          ruleId: rule.ruleId,
          ruleName: rule.displayName,
          severity: rule.severity,
          status: "open",
          details: JSON.stringify(anomalyDetails),
          auditLogId: args.auditLogId,
          projectId: args.projectId,
          detectedAt: now,
          createdAt: now,
        });
        detected++;

        // Schedule email alert if enabled
        if (rule.emailAlertEnabled) {
          // Get user and org info for email
          const user = await ctx.db.get(args.userId);
          const org = await ctx.db.get(args.organizationId);

          if (user && org) {
            await ctx.scheduler.runAfter(
              0,
              internal.emails.sendAnomalyAlertEmail,
              {
                userId: args.userId,
                organizationId: args.organizationId,
                userName: user.name || user.email || "Unknown",
                userEmail: user.email || "",
                orgName: org.name,
                ruleName: rule.displayName,
                severity: rule.severity,
                details: JSON.stringify(anomalyDetails),
                detectedAt: now,
              }
            );
          }
        }
      }
    }

    return { detected };
  },
});

// ==========================================
// RULE EVALUATION ENGINE
// ==========================================

async function evaluateRule(
  ctx: MutationCtx,
  ruleId: string,
  thresholdsJson: string,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    action: string;
    ipAddress?: string;
    userAgent?: string;
    involvesSensitiveData?: boolean;
    createdAt: number;
  },
  baseline: {
    knownIps: string[];
    knownUserAgents: string[];
    typicalHoursStart: number;
    typicalHoursEnd: number;
    hasPulledProd: boolean;
    avgDailyAccesses: number;
    daysOfHistory: number;
  } | null,
  parsedDetails: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  let thresholds: Record<string, unknown> = {};
  try {
    thresholds = JSON.parse(thresholdsJson);
  } catch {
    // Use defaults
  }

  switch (ruleId) {
    case "new_ip":
      return evaluateNewIp(args, baseline);
    case "off_hours":
      return evaluateOffHours(args, baseline, thresholds);
    case "first_prod_bulk_pull":
      return evaluateFirstProdBulkPull(args, baseline, parsedDetails);
    case "velocity_spike":
      return await evaluateVelocitySpike(ctx, args, baseline, thresholds);
    case "new_device_sensitive":
      return evaluateNewDeviceSensitive(args, baseline);
    case "cross_org_burst":
      return await evaluateCrossOrgBurst(ctx, args, thresholds);
    default:
      return null;
  }
}

function evaluateNewIp(
  args: { ipAddress?: string },
  baseline: { knownIps: string[] } | null
): Record<string, unknown> | null {
  if (!args.ipAddress || args.ipAddress === "unknown" || !baseline) {
    return null;
  }
  if (!baseline.knownIps.includes(args.ipAddress)) {
    return {
      type: "new_ip",
      newIp: args.ipAddress,
      knownIpCount: baseline.knownIps.length,
      message: `Access from new IP address: ${args.ipAddress}`,
    };
  }
  return null;
}

function evaluateOffHours(
  args: { createdAt: number },
  baseline: { typicalHoursStart: number; typicalHoursEnd: number } | null,
  thresholds: Record<string, unknown>
): Record<string, unknown> | null {
  if (!baseline) return null;

  const bufferHours = (thresholds.bufferHours as number) || 2;
  const hour = new Date(args.createdAt).getUTCHours();
  const start = baseline.typicalHoursStart - bufferHours;
  const end = baseline.typicalHoursEnd + bufferHours;

  // Handle wrap-around (e.g., start=-2 → 22, end=21)
  const normalizedStart = ((start % 24) + 24) % 24;
  const normalizedEnd = ((end % 24) + 24) % 24;

  let isOffHours: boolean;
  if (normalizedStart <= normalizedEnd) {
    isOffHours = hour < normalizedStart || hour > normalizedEnd;
  } else {
    // Wraps midnight: e.g., 22-05 → off hours is 06-21
    isOffHours = hour > normalizedEnd && hour < normalizedStart;
  }

  if (isOffHours) {
    return {
      type: "off_hours",
      accessHour: hour,
      typicalRange: `${baseline.typicalHoursStart}:00 - ${baseline.typicalHoursEnd}:00 UTC`,
      bufferHours,
      message: `Access at ${hour}:00 UTC, outside typical hours (${baseline.typicalHoursStart}:00-${baseline.typicalHoursEnd}:00 UTC)`,
    };
  }
  return null;
}

function evaluateFirstProdBulkPull(
  args: { action: string },
  baseline: { hasPulledProd: boolean } | null,
  parsedDetails: Record<string, unknown>
): Record<string, unknown> | null {
  if (args.action !== "variable.exported") return null;
  if (parsedDetails.environment !== "production") return null;

  // If no baseline, this is their very first action — still suspicious for prod export
  if (!baseline || !baseline.hasPulledProd) {
    return {
      type: "first_prod_bulk_pull",
      environment: "production",
      message:
        "First-time production secrets export detected. This user has never exported production variables before.",
    };
  }
  return null;
}

async function evaluateVelocitySpike(
  ctx: MutationCtx,
  args: { userId: Id<"users">; createdAt: number },
  baseline: { avgDailyAccesses: number } | null,
  thresholds: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  if (!baseline || baseline.avgDailyAccesses === 0) return null;

  const multiplier = (thresholds.velocityMultiplier as number) || 5;
  const windowMinutes = (thresholds.windowMinutes as number) || 60;
  const windowStart = args.createdAt - windowMinutes * 60 * 1000;

  // Count accesses in the time window
  const recentLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_user_and_created", (q) =>
      q.eq("userId", args.userId).gte("createdAt", windowStart)
    )
    .collect();

  const recentCount = recentLogs.length;
  const expectedHourlyRate = baseline.avgDailyAccesses / 8; // 8-hour workday
  const spikeThreshold = expectedHourlyRate * multiplier;

  if (recentCount > spikeThreshold && spikeThreshold > 0) {
    return {
      type: "velocity_spike",
      recentCount,
      windowMinutes,
      expectedHourlyRate: Math.round(expectedHourlyRate * 100) / 100,
      spikeThreshold: Math.round(spikeThreshold * 100) / 100,
      multiplier,
      message: `${recentCount} accesses in ${windowMinutes} minutes (expected ~${Math.round(expectedHourlyRate)}/hr)`,
    };
  }
  return null;
}

function evaluateNewDeviceSensitive(
  args: { userAgent?: string; involvesSensitiveData?: boolean },
  baseline: { knownUserAgents: string[] } | null
): Record<string, unknown> | null {
  if (!args.involvesSensitiveData || !args.userAgent || !baseline) {
    return null;
  }
  if (!baseline.knownUserAgents.includes(args.userAgent)) {
    return {
      type: "new_device_sensitive",
      newUserAgent: args.userAgent,
      knownDeviceCount: baseline.knownUserAgents.length,
      message: `Sensitive data accessed from unrecognized device: ${args.userAgent.slice(0, 80)}`,
    };
  }
  return null;
}

async function evaluateCrossOrgBurst(
  ctx: MutationCtx,
  args: { userId: Id<"users">; createdAt: number },
  thresholds: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const windowMinutes = (thresholds.windowMinutes as number) || 5;
  const minOrgs = (thresholds.minOrgs as number) || 3;
  const windowStart = args.createdAt - windowMinutes * 60 * 1000;

  // Get recent audit logs for this user across all orgs
  const recentLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_user_and_created", (q) =>
      q.eq("userId", args.userId).gte("createdAt", windowStart)
    )
    .collect();

  const uniqueOrgs = new Set(
    recentLogs.map((log) => log.organizationId.toString())
  );

  if (uniqueOrgs.size >= minOrgs) {
    return {
      type: "cross_org_burst",
      orgCount: uniqueOrgs.size,
      windowMinutes,
      minOrgs,
      message: `Accessed ${uniqueOrgs.size} organizations within ${windowMinutes} minutes`,
    };
  }
  return null;
}

// ==========================================
// PUBLIC QUERIES
// ==========================================

/**
 * Get anomaly events for an organization (feature-gated).
 */
export const getAnomalyEvents = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("acknowledged"),
        v.literal("dismissed"),
        v.literal("resolved")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Feature gate check
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "anomaly_detection"
    );
    if (!gate.allowed) {
      return { events: [], gated: true, tierName: gate.tierName };
    }

    let events;
    if (args.status) {
      events = await ctx.db
        .query("anomalyEvents")
        .withIndex("by_org_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", args.status!)
        )
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("anomalyEvents")
        .withIndex("by_org_and_detected", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .take(limit);
    }

    // Enrich with user names
    const enriched = await Promise.all(
      events.map(async (event) => {
        const user = await ctx.db.get(event.userId);
        return {
          ...event,
          userName: user?.name ?? user?.email ?? "Unknown",
          userEmail: user?.email ?? "Unknown",
          parsedDetails: (() => {
            try {
              return JSON.parse(event.details);
            } catch {
              return {};
            }
          })(),
        };
      })
    );

    return { events: enriched, gated: false };
  },
});

/**
 * Get count of unresolved (open) anomaly events for badge display.
 */
export const getUnresolvedCount = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "anomaly_detection"
    );
    if (!gate.allowed) return { count: 0, gated: true };

    const events = await ctx.db
      .query("anomalyEvents")
      .withIndex("by_org_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", "open")
      )
      .collect();

    return { count: events.length, gated: false };
  },
});

/**
 * Get summary of anomaly events by severity and status.
 */
export const getEventSummary = query({
  args: {
    organizationId: v.id("organizations"),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "anomaly_detection"
    );
    if (!gate.allowed) {
      return { summary: null, gated: true };
    }

    const daysBack = args.daysBack ?? 30;
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const events = await ctx.db
      .query("anomalyEvents")
      .withIndex("by_org_and_detected", (q) =>
        q.eq("organizationId", args.organizationId).gte("detectedAt", cutoff)
      )
      .collect();

    const bySeverity = { info: 0, warning: 0, critical: 0 };
    const byStatus = {
      open: 0,
      acknowledged: 0,
      dismissed: 0,
      resolved: 0,
    };

    for (const event of events) {
      bySeverity[event.severity]++;
      byStatus[event.status]++;
    }

    return {
      summary: {
        total: events.length,
        bySeverity,
        byStatus,
        daysBack,
      },
      gated: false,
    };
  },
});

/**
 * List all anomaly rules.
 */
export const listRules = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("anomalyRules").collect();
  },
});

/**
 * Get a single anomaly rule by ruleId.
 */
export const getRule = query({
  args: { ruleId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("anomalyRules")
      .withIndex("by_rule_id", (q) => q.eq("ruleId", args.ruleId))
      .first();
  },
});

// ==========================================
// PUBLIC MUTATIONS
// ==========================================

/**
 * Dismiss an anomaly event ("This Was Me" flow).
 */
export const dismissAnomaly = mutation({
  args: {
    anomalyEventId: v.id("anomalyEvents"),
    dismissedBy: v.id("users"),
    reason: v.optional(v.string()),
    suppressPattern: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.anomalyEventId);
    if (!event) throw new Error("Anomaly event not found");

    await ctx.db.patch(args.anomalyEventId, {
      status: "dismissed",
      resolvedBy: args.dismissedBy,
      resolvedAt: Date.now(),
      resolutionNote: args.reason ?? "Dismissed by user",
    });

    await ctx.db.insert("anomalyDismissals", {
      anomalyEventId: args.anomalyEventId,
      dismissedBy: args.dismissedBy,
      reason: args.reason,
      suppressFuturePattern: args.suppressPattern,
      dismissedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Resolve an anomaly event (admin action).
 */
export const resolveAnomaly = mutation({
  args: {
    anomalyEventId: v.id("anomalyEvents"),
    resolvedBy: v.id("users"),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.anomalyEventId);
    if (!event) throw new Error("Anomaly event not found");

    await ctx.db.patch(args.anomalyEventId, {
      status: "resolved",
      resolvedBy: args.resolvedBy,
      resolvedAt: Date.now(),
      resolutionNote: args.note,
    });

    return { success: true };
  },
});

/**
 * Create an organization-level anomaly rule.
 */
export const createOrgRule = mutation({
  args: {
    ruleId: v.string(),
    displayName: v.string(),
    description: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical")
    ),
    thresholds: v.optional(v.string()),
    minHistoryDays: v.optional(v.number()),
    emailAlertEnabled: v.optional(v.boolean()),
    alertCooldownMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check if rule with same ruleId already exists
    const existing = await ctx.db
      .query("anomalyRules")
      .withIndex("by_rule_id", (q) => q.eq("ruleId", args.ruleId))
      .first();
    if (existing) {
      throw new Error(`Rule with ID "${args.ruleId}" already exists`);
    }

    const now = Date.now();
    const ruleId = await ctx.db.insert("anomalyRules", {
      ruleId: args.ruleId,
      displayName: args.displayName,
      description: args.description,
      isEnabled: true,
      severity: args.severity,
      thresholds: args.thresholds ?? "{}",
      minHistoryDays: args.minHistoryDays ?? 7,
      emailAlertEnabled: args.emailAlertEnabled ?? false,
      alertCooldownMinutes: args.alertCooldownMinutes ?? 240,
      createdAt: now,
      updatedAt: now,
    });

    return { _id: ruleId };
  },
});

/**
 * Update an anomaly rule.
 */
export const updateOrgRule = mutation({
  args: {
    ruleId: v.string(),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    isEnabled: v.optional(v.boolean()),
    severity: v.optional(
      v.union(v.literal("info"), v.literal("warning"), v.literal("critical"))
    ),
    thresholds: v.optional(v.string()),
    minHistoryDays: v.optional(v.number()),
    emailAlertEnabled: v.optional(v.boolean()),
    alertCooldownMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db
      .query("anomalyRules")
      .withIndex("by_rule_id", (q) => q.eq("ruleId", args.ruleId))
      .first();
    if (!rule) throw new Error(`Rule not found: ${args.ruleId}`);

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) updates.displayName = args.displayName;
    if (args.description !== undefined) updates.description = args.description;
    if (args.isEnabled !== undefined) updates.isEnabled = args.isEnabled;
    if (args.severity !== undefined) updates.severity = args.severity;
    if (args.thresholds !== undefined) updates.thresholds = args.thresholds;
    if (args.minHistoryDays !== undefined)
      updates.minHistoryDays = args.minHistoryDays;
    if (args.emailAlertEnabled !== undefined)
      updates.emailAlertEnabled = args.emailAlertEnabled;
    if (args.alertCooldownMinutes !== undefined)
      updates.alertCooldownMinutes = args.alertCooldownMinutes;

    await ctx.db.patch(rule._id, updates);
    return { success: true };
  },
});

/**
 * Delete an anomaly rule.
 */
export const deleteOrgRule = mutation({
  args: {
    ruleId: v.string(),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db
      .query("anomalyRules")
      .withIndex("by_rule_id", (q) => q.eq("ruleId", args.ruleId))
      .first();
    if (!rule) throw new Error(`Rule not found: ${args.ruleId}`);

    await ctx.db.delete(rule._id);
    return { success: true };
  },
});

// ==========================================
// AUTOMATED TEST SUITE
// ==========================================

/**
 * Test scenario definition.
 */
interface TestScenario {
  id: string;
  ruleId: string;
  description: string;
  expectFire: boolean;
  auditArgs: {
    action: string;
    ipAddress?: string;
    userAgent?: string;
    involvesSensitiveData?: boolean;
    createdAt: number;
    details: Record<string, unknown>;
  };
}

/**
 * Individual test result.
 */
interface TestResult {
  id: string;
  rule: string;
  description: string;
  expectFire: boolean;
  actuallyFired: boolean;
  passed: boolean;
  anomalyDetails: Record<string, unknown> | null;
}

/**
 * The known user-agent string used in the seeded baseline.
 * Tests that should match a "known device" use this exact string.
 */
const KNOWN_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Run automated anomaly detection test suite.
 *
 * 1. Cleans up previous test data (anomaly events, test audit logs, baseline).
 * 2. Seeds a controlled baseline with known behavioral patterns.
 * 3. Seeds velocity audit logs (pre-condition for the velocity_spike rule).
 * 4. Evaluates each rule against crafted scenarios — both positive (should fire)
 *    and negative (should NOT fire) — using the real evaluateRule engine.
 * 5. Returns a detailed report showing pass/fail per scenario.
 *
 * Callable from admin.ts runMigration or a dedicated admin mutation.
 */
export async function runAnomalyDetectionTest(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
  }
): Promise<{
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  cleanup: {
    anomalyEventsDeleted: number;
    testAuditLogsDeleted: number;
  };
  seeded: {
    baselineCreated: boolean;
    velocityLogsCreated: number;
  };
  anomalyEventsCreated: number;
  featureGateStatus: string;
}> {
  const now = Date.now();
  const orgId = args.organizationId;
  const userId = args.userId;

  // ── Phase 1: Check prerequisites ──────────────────────────────

  const gate = await checkBooleanFeature(ctx.db, orgId, "anomaly_detection");
  const featureGateStatus = gate.allowed
    ? "enabled"
    : `disabled (tier: ${gate.tierName ?? "unknown"})`;

  const allRules = await ctx.db.query("anomalyRules").collect();
  if (allRules.length === 0) {
    return {
      results: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 },
      cleanup: { anomalyEventsDeleted: 0, testAuditLogsDeleted: 0 },
      seeded: { baselineCreated: false, velocityLogsCreated: 0 },
      anomalyEventsCreated: 0,
      featureGateStatus:
        "ERROR: No anomaly rules found. Run 'seed-anomaly-rules' migration first.",
    };
  }

  // Build rule map for quick lookup
  const ruleMap = new Map<string, Doc<"anomalyRules">>();
  for (const rule of allRules) {
    ruleMap.set(rule.ruleId, rule);
  }

  // ── Phase 2: Cleanup previous test data ───────────────────────

  // 2a. Delete test anomaly events for this org
  const existingEvents = await ctx.db
    .query("anomalyEvents")
    .withIndex("by_organization", (q) => q.eq("organizationId", orgId))
    .collect();
  // Only delete events that reference test audit logs (have __test marker)
  let anomalyEventsDeleted = 0;
  for (const event of existingEvents) {
    try {
      const details = JSON.parse(event.details);
      if (details.__test) {
        await ctx.db.delete(event._id);
        anomalyEventsDeleted++;
      }
    } catch {
      // Not a test event — leave it alone
    }
  }

  // 2b. Delete test audit logs for this org (identified by __test marker in details)
  const orgAuditLogs = await ctx.db
    .query("auditLogs")
    .withIndex("by_org_and_created", (q) => q.eq("organizationId", orgId))
    .collect();
  let testAuditLogsDeleted = 0;
  for (const log of orgAuditLogs) {
    try {
      const details = JSON.parse(log.details || "{}");
      if (details.__test) {
        await ctx.db.delete(log._id);
        testAuditLogsDeleted++;
      }
    } catch {
      // Not a test log
    }
  }

  // 2c. Delete existing baseline for this user+org
  const existingBaseline = await ctx.db
    .query("accessBaselines")
    .withIndex("by_user_and_org", (q) =>
      q.eq("userId", userId).eq("organizationId", orgId)
    )
    .first();
  if (existingBaseline) {
    await ctx.db.delete(existingBaseline._id);
  }

  // ── Phase 3: Seed controlled baseline ─────────────────────────
  //
  // The baseline represents a user who:
  // - Works from 3 known IPs (home, office, VPN)
  // - Uses Chrome on macOS
  // - Typical hours 9 AM–5 PM UTC, Mon–Fri
  // - Has accessed dev and staging, but NEVER production
  // - Averages 5 accesses per day over 30 days

  await ctx.db.insert("accessBaselines", {
    userId,
    organizationId: orgId,
    knownIps: ["192.168.1.100", "10.0.0.1", "172.16.0.50"],
    knownUserAgents: [KNOWN_USER_AGENT],
    typicalHoursStart: 9,
    typicalHoursEnd: 17,
    typicalDays: [1, 2, 3, 4, 5],
    accessedEnvironments: ["development", "staging"],
    hasPulledProd: false,
    avgDailyAccesses: 5,
    totalAccessCount: 150,
    daysOfHistory: 30,
    lastUpdated: now,
    createdAt: now - 30 * 24 * 60 * 60 * 1000,
  });

  // ── Phase 4: Seed velocity audit logs ─────────────────────────
  //
  // Insert 10 audit logs spread over the last 30 minutes for this user.
  // Threshold = (5 / 8) × 5 = 3.125, so 10+ logs in 60min → spike.
  // These use known IP and known UA so they don't accidentally trigger
  // new_ip or new_device_sensitive.

  let velocityLogsCreated = 0;
  for (let i = 0; i < 10; i++) {
    await ctx.db.insert("auditLogs", {
      organizationId: orgId,
      userId,
      action: "variable.exported",
      details: JSON.stringify({
        __test: true,
        environment: "development",
        variableKey: `VELOCITY_SEED_VAR_${i}`,
        accessType: "export",
      }),
      ipAddress: "192.168.1.100",
      userAgent: KNOWN_USER_AGENT,
      severity: "info",
      resourceType: "variable",
      createdAt: now - (25 - i * 2) * 60 * 1000, // -25min to -7min ago
    });
    velocityLogsCreated++;
  }

  // ── Phase 5: Load fresh baseline for evaluation ───────────────

  const baseline = await ctx.db
    .query("accessBaselines")
    .withIndex("by_user_and_org", (q) =>
      q.eq("userId", userId).eq("organizationId", orgId)
    )
    .first();

  // ── Phase 6: Define test scenarios ────────────────────────────

  // Timestamp helpers
  const todayAt3AM = new Date(now);
  todayAt3AM.setUTCHours(3, 0, 0, 0);
  const offHoursTs = todayAt3AM.getTime();

  const todayAtNoon = new Date(now);
  todayAtNoon.setUTCHours(12, 0, 0, 0);
  const normalHoursTs = todayAtNoon.getTime();

  const scenarios: TestScenario[] = [
    // ── new_ip ──
    {
      id: "new_ip_positive",
      ruleId: "new_ip",
      description: "Unknown IP 203.0.113.42 → should FIRE",
      expectFire: true,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "203.0.113.42",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: now,
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_NEW_IP_POS",
          accessType: "export",
        },
      },
    },
    {
      id: "new_ip_negative",
      ruleId: "new_ip",
      description: "Known IP 192.168.1.100 → should NOT fire",
      expectFire: false,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: now,
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_NEW_IP_NEG",
          accessType: "export",
        },
      },
    },

    // ── off_hours ──
    {
      id: "off_hours_positive",
      ruleId: "off_hours",
      description: "Access at 3 AM UTC (outside 7-19 buffer) → should FIRE",
      expectFire: true,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: offHoursTs,
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_OFF_HOURS_POS",
          accessType: "export",
        },
      },
    },
    {
      id: "off_hours_negative",
      ruleId: "off_hours",
      description: "Access at 12 PM UTC (within 7-19 buffer) → should NOT fire",
      expectFire: false,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: normalHoursTs,
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_OFF_HOURS_NEG",
          accessType: "export",
        },
      },
    },

    // ── first_prod_bulk_pull ──
    {
      id: "first_prod_positive",
      ruleId: "first_prod_bulk_pull",
      description:
        "First production export (hasPulledProd=false) → should FIRE",
      expectFire: true,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: true,
        createdAt: now,
        details: {
          __test: true,
          environment: "production",
          variableKey: "DB_PASSWORD",
          accessType: "export",
        },
      },
    },
    {
      id: "first_prod_negative",
      ruleId: "first_prod_bulk_pull",
      description: "Development export → should NOT fire",
      expectFire: false,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: now,
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_PROD_NEG",
          accessType: "export",
        },
      },
    },

    // ── velocity_spike ──
    {
      id: "velocity_spike_positive",
      ruleId: "velocity_spike",
      description:
        "11th access in 60min window (threshold ~3.1) → should FIRE",
      expectFire: true,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: false,
        createdAt: now, // Within the window of the 10 seeded logs
        details: {
          __test: true,
          environment: "development",
          variableKey: "TEST_VELOCITY_POS",
          accessType: "export",
        },
      },
    },

    // ── new_device_sensitive ──
    {
      id: "new_device_positive",
      ruleId: "new_device_sensitive",
      description:
        'Unknown UA "SuspiciousBot/1.0" + sensitive data → should FIRE',
      expectFire: true,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: "SuspiciousBot/1.0 (Linux x86_64)",
        involvesSensitiveData: true,
        createdAt: now,
        details: {
          __test: true,
          environment: "development",
          variableKey: "API_SECRET_KEY",
          accessType: "export",
        },
      },
    },
    {
      id: "new_device_negative",
      ruleId: "new_device_sensitive",
      description: "Known UA + sensitive data → should NOT fire",
      expectFire: false,
      auditArgs: {
        action: "variable.exported",
        ipAddress: "192.168.1.100",
        userAgent: KNOWN_USER_AGENT,
        involvesSensitiveData: true,
        createdAt: now,
        details: {
          __test: true,
          environment: "development",
          variableKey: "API_SECRET_KEY",
          accessType: "export",
        },
      },
    },

    // ── cross_org_burst ── (skipped — requires multi-org setup)
    // This rule counts distinct organizationIds in recent audit logs.
    // Testing it properly requires the user to have audit logs from 3+ orgs,
    // which is not feasible in a single-org test environment.
  ];

  // ── Phase 7: Execute test scenarios ───────────────────────────

  const results: TestResult[] = [];
  let anomalyEventsCreated = 0;

  for (const scenario of scenarios) {
    const rule = ruleMap.get(scenario.ruleId);

    // If the rule doesn't exist or is disabled, skip
    if (!rule) {
      results.push({
        id: scenario.id,
        rule: scenario.ruleId,
        description: scenario.description,
        expectFire: scenario.expectFire,
        actuallyFired: false,
        passed: false,
        anomalyDetails: {
          __skipped: true,
          reason: `Rule "${scenario.ruleId}" not found or not seeded`,
        },
      });
      continue;
    }

    if (!rule.isEnabled) {
      results.push({
        id: scenario.id,
        rule: scenario.ruleId,
        description: scenario.description,
        expectFire: scenario.expectFire,
        actuallyFired: false,
        passed: !scenario.expectFire, // If we didn't expect it to fire, that's a pass
        anomalyDetails: {
          __skipped: true,
          reason: `Rule "${scenario.ruleId}" is disabled`,
        },
      });
      continue;
    }

    // Insert the test audit log so velocity_spike / cross_org_burst can see it
    const auditLogId = await ctx.db.insert("auditLogs", {
      organizationId: orgId,
      userId,
      action: scenario.auditArgs.action as Doc<"auditLogs">["action"],
      details: JSON.stringify(scenario.auditArgs.details),
      ipAddress: scenario.auditArgs.ipAddress,
      userAgent: scenario.auditArgs.userAgent,
      severity: "info",
      resourceType: "variable",
      involvesSensitiveData: scenario.auditArgs.involvesSensitiveData,
      createdAt: scenario.auditArgs.createdAt,
    });

    // Evaluate the rule
    const anomalyDetails = await evaluateRule(
      ctx,
      scenario.ruleId,
      rule.thresholds,
      {
        userId,
        organizationId: orgId,
        action: scenario.auditArgs.action,
        ipAddress: scenario.auditArgs.ipAddress,
        userAgent: scenario.auditArgs.userAgent,
        involvesSensitiveData: scenario.auditArgs.involvesSensitiveData,
        createdAt: scenario.auditArgs.createdAt,
      },
      baseline,
      scenario.auditArgs.details
    );

    const fired = anomalyDetails !== null;
    const passed = fired === scenario.expectFire;

    // If the rule fired, create an anomaly event (visible in the admin Events tab)
    if (fired) {
      await ctx.db.insert("anomalyEvents", {
        organizationId: orgId,
        userId,
        ruleId: rule.ruleId,
        ruleName: rule.displayName,
        severity: rule.severity,
        status: "open",
        details: JSON.stringify({ ...anomalyDetails, __test: true }),
        auditLogId,
        detectedAt: scenario.auditArgs.createdAt,
        createdAt: now,
      });
      anomalyEventsCreated++;
    }

    results.push({
      id: scenario.id,
      rule: scenario.ruleId,
      description: scenario.description,
      expectFire: scenario.expectFire,
      actuallyFired: fired,
      passed,
      anomalyDetails: fired
        ? (anomalyDetails as Record<string, unknown>)
        : null,
    });
  }

  // ── Phase 8: Add cross_org_burst as skipped ───────────────────

  results.push({
    id: "cross_org_burst_skipped",
    rule: "cross_org_burst",
    description:
      "Skipped — requires 3+ organizations (single-org test environment)",
    expectFire: true,
    actuallyFired: false,
    passed: false,
    anomalyDetails: {
      __skipped: true,
      reason:
        "Cannot test cross_org_burst in a single-org context. This rule requires audit logs from 3+ different organizations within a 5-minute window.",
    },
  });

  // ── Summary ───────────────────────────────────────────────────

  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter(
    (r) => r.anomalyDetails?.__skipped === true
  ).length;
  const failed = results.filter(
    (r) => !r.passed && r.anomalyDetails?.__skipped !== true
  ).length;

  return {
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
    },
    cleanup: {
      anomalyEventsDeleted,
      testAuditLogsDeleted,
    },
    seeded: {
      baselineCreated: true,
      velocityLogsCreated,
    },
    anomalyEventsCreated,
    featureGateStatus,
  };
}
