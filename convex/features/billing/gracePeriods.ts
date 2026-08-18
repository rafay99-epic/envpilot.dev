import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { getDefaultTierName, isCronPaused } from "./tierLimits";

/**
 * Subscription grace-period & usage-counter lifecycle.
 *
 * SECURITY: All mutations here are internalMutation — they cannot be called
 * from the client. Only the processWebhookEvent action and crons dispatch to
 * them.
 */

/**
 * Reset consumption counters on billing cycle.
 *
 * DEAD DATA: the `usageCounters` table this operated on is never inserted into
 * anywhere in the codebase (consumption tracking was never wired up), so this
 * was always a no-op. Body removed to drop the last code reference to
 * `usageCounters`, so the table declaration can be dropped once a deployment
 * confirms the table is empty. Kept as a no-op stub so
 * the four billing-webhook call sites remain unchanged. Zero behavior change.
 */
export const _resetUsageCounters = internalMutation({
  args: {
    userId: v.id("users"),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async () => {
    // No-op: usageCounters is never populated. See doc comment above.
  },
});

/**
 * Create grace period after subscription cancellation.
 * During grace period, user retains their previous tier.
 */
export const _createGracePeriod = internalMutation({
  args: {
    userId: v.id("users"),
    previousTier: v.string(),
    gracePeriodDays: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Prevent grace period abuse: enforce 30-day cooldown between grace
    // periods. The skip must DOWNGRADE IMMEDIATELY, not no-op — with no
    // grace row the expiry cron never fires, so a silent return here would
    // leave the revoked user on their paid tier forever
    // (subscribe → cancel → resubscribe → cancel again within 30 days).
    const recentGrace = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    if (recentGrace && now - recentGrace.createdAt < 30 * 24 * 60 * 60 * 1000) {
      const defaultTier = await getDefaultTierName(ctx.db);
      const existingTier = await ctx.db
        .query("userTiers")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .first();
      if (existingTier) {
        await ctx.db.patch(existingTier._id, {
          tier: defaultTier,
          updatedAt: now,
          reason: "billing.grace_period_cooldown_immediate_downgrade",
        });
      } else {
        await ctx.db.insert("userTiers", {
          userId: args.userId,
          tier: defaultTier,
          updatedAt: now,
          reason: "billing.grace_period_cooldown_immediate_downgrade",
        });
      }
      return;
    }

    // Deactivate any existing grace period
    const existing = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const g of existing) {
      await ctx.db.patch(g._id, { isActive: false });
    }

    await ctx.db.insert("subscriptionGracePeriods", {
      userId: args.userId,
      previousTier: args.previousTier,
      gracePeriodEnd: now + args.gracePeriodDays * 24 * 60 * 60 * 1000,
      createdAt: now,
      isActive: true,
    });
  },
});

/**
 * Clear grace period (on re-subscription)
 */
export const _clearGracePeriod = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const g of active) {
      if (g.isActive) {
        await ctx.db.patch(g._id, { isActive: false });
      }
    }
  },
});

/**
 * Expire grace periods — called by cron every hour.
 * Downgrades users whose grace period has ended.
 */
export const expireGracePeriods = internalMutation({
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_expire_grace_periods")) return;

    const now = Date.now();

    // Compound index range reads only grace periods whose end has actually
    // passed, instead of collecting every active grace period each run
    const due = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_active_and_end", (q) =>
        q.eq("isActive", true).lte("gracePeriodEnd", now)
      )
      .collect();

    const defaultTier = await getDefaultTierName(ctx.db);

    for (const g of due) {
      if (g.gracePeriodEnd <= now) {
        // Grace period expired → downgrade to default tier
        await ctx.db.patch(g._id, { isActive: false });

        // Sync user tier to default
        const existing = await ctx.db
          .query("userTiers")
          .withIndex("by_user", (q) => q.eq("userId", g.userId))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            tier: defaultTier,
            updatedAt: now,
            reason: "billing.grace_period_expired",
          });
        } else {
          await ctx.db.insert("userTiers", {
            userId: g.userId,
            tier: defaultTier,
            updatedAt: now,
            reason: "billing.grace_period_expired",
          });
        }

        // Audit: tier downgraded after grace period expiry — indexed point
        // lookup (organizations.by_created_by), not a full-table scan.
        const ownedOrg = await ctx.db
          .query("organizations")
          .withIndex("by_created_by", (q) => q.eq("createdBy", g.userId))
          .first();
        if (ownedOrg) {
          await ctx.db.insert("auditLogs", {
            organizationId: ownedOrg._id,
            userId: g.userId,
            action: "billing.tier_downgraded",
            details: JSON.stringify({
              previousTier: g.previousTier,
              newTier: defaultTier,
              reason: "grace_period_expired",
            }),
            createdAt: now,
          });
        }
      }
    }
  },
});
