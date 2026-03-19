import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { DatabaseReader } from "./_generated/server";
import { getDefaultTierName } from "./tierLimits";
import { getUserTier } from "./featureRegistry";

/**
 * Subscription Management for Stripe Integration
 *
 * USER-LEVEL BILLING: Subscriptions and Stripe customers are keyed by
 * userId. The org owner's subscription determines the tier for all
 * their owned organizations via the userTiers table.
 *
 * SECURITY: All webhook mutations are internalMutation — they cannot be
 * called from the client. Only the processWebhookEvent action (which is
 * called from the verified Stripe webhook handler) dispatches to them.
 */

// Subscription status type (matches Stripe's subscription statuses)
export const subscriptionStatus = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("past_due"),
  v.literal("paused"),
  v.literal("trialing"),
  v.literal("unpaid")
);

// ==========================================
// DYNAMIC PRICE-TO-TIER MAPPING
// ==========================================

/**
 * Maps a Stripe price ID to a tier name by looking up tierDefinitions.
 * Falls back to default tier if no match found.
 */
async function mapPriceIdToTier(
  db: DatabaseReader,
  priceId: string
): Promise<string> {
  const allTiers = await db.query("tierDefinitions").collect();
  const match = allTiers.find((t) => t.stripePriceId === priceId);
  if (match) return match.name;
  return await getDefaultTierName(db);
}

// ==========================================
// QUERIES (public, read-only — safe)
// ==========================================

/**
 * Get subscription for an organization (LEGACY — backward compat)
 */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
  },
});

/**
 * Get subscription for a user (NEW — user-level billing)
 */
export const getByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get subscription by Stripe subscription ID
 */
export const getByStripeSubscriptionId = query({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
  },
});

/**
 * Get Stripe customer for an organization (LEGACY — backward compat)
 */
export const getStripeCustomer = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
  },
});

/**
 * Get Stripe customer for a user (NEW)
 */
export const getStripeCustomerByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get Stripe customer by Stripe customer ID
 */
export const getStripeCustomerById = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeCustomers")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
  },
});

/**
 * Check if organization has active subscription (LEGACY — backward compat)
 */
export const hasActiveSubscription = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (!subscription) {
      return false;
    }

    return (
      subscription.status === "active" || subscription.status === "trialing"
    );
  },
});

/**
 * Check if user has active subscription (NEW)
 */
export const hasActiveUserSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!subscription) {
      return false;
    }

    return (
      subscription.status === "active" || subscription.status === "trialing"
    );
  },
});

// ==========================================
// INTERNAL MUTATIONS (server-only, not callable from client)
// ==========================================

/**
 * Create or update a Stripe customer mapping
 */
export const upsertStripeCustomer = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Try to find by user first, then by org
    let existing = await ctx.db
      .query("stripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!existing) {
      existing = await ctx.db
        .query("stripeCustomers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first();
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        email: args.email,
        userId: args.userId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("stripeCustomers", {
      organizationId: args.organizationId,
      userId: args.userId,
      stripeCustomerId: args.stripeCustomerId,
      email: args.email,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Create a new subscription record
 */
export const createSubscription = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripePriceId: v.string(),
    status: subscriptionStatus,
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    cancelAtPeriodEnd: v.boolean(),
    cancelAt: v.optional(v.number()),
    trialStart: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if subscription already exists
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (existing) {
      // Update existing subscription
      await ctx.db.patch(existing._id, {
        status: args.status,
        userId: args.userId,
        currentPeriodStart: args.currentPeriodStart,
        currentPeriodEnd: args.currentPeriodEnd,
        cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        cancelAt: args.cancelAt,
        trialStart: args.trialStart,
        trialEnd: args.trialEnd,
        updatedAt: now,
      });
      return existing._id;
    }

    // Create new subscription
    return await ctx.db.insert("subscriptions", {
      organizationId: args.organizationId,
      userId: args.userId,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripePriceId: args.stripePriceId,
      status: args.status,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
      cancelAt: args.cancelAt,
      trialStart: args.trialStart,
      trialEnd: args.trialEnd,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update a subscription from Stripe webhook
 */
export const updateSubscription = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
    status: subscriptionStatus,
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
    cancelAt: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (!subscription) {
      throw new Error(`Subscription not found: ${args.stripeSubscriptionId}`);
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.currentPeriodStart !== undefined) {
      updateData.currentPeriodStart = args.currentPeriodStart;
    }
    if (args.currentPeriodEnd !== undefined) {
      updateData.currentPeriodEnd = args.currentPeriodEnd;
    }
    if (args.cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = args.cancelAtPeriodEnd;
    }
    if (args.cancelAt !== undefined) {
      updateData.cancelAt = args.cancelAt;
    }
    if (args.trialEnd !== undefined) {
      updateData.trialEnd = args.trialEnd;
    }

    await ctx.db.patch(subscription._id, updateData);

    return subscription._id;
  },
});

/**
 * Delete a subscription (when customer is deleted in Stripe)
 */
export const deleteSubscription = internalMutation({
  args: {
    stripeSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();

    if (subscription) {
      await ctx.db.delete(subscription._id);
    }
  },
});

/**
 * Sync user's tier (NEW — primary tier assignment).
 * Writes to userTiers table. This is the source of truth for billing.
 */
export const _syncUserTier = internalMutation({
  args: {
    userId: v.id("users"),
    tier: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: args.tier,
        updatedAt: now,
        reason: args.reason,
      });
    } else {
      await ctx.db.insert("userTiers", {
        userId: args.userId,
        tier: args.tier,
        updatedAt: now,
        reason: args.reason,
      });
    }
  },
});

/**
 * Reset consumption counters on billing cycle.
 * Only resets counters for resettable features.
 */
export const _resetUsageCounters = internalMutation({
  args: {
    userId: v.id("users"),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    // Only reset counters for features marked as resettable in the registry
    const resettableFeatures = await ctx.db
      .query("featureRegistry")
      .filter((q) => q.eq(q.field("resettable"), true))
      .collect();
    const resettableKeys = new Set(resettableFeatures.map((f) => f.key));

    const counters = await ctx.db
      .query("usageCounters")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const counter of counters) {
      if (resettableKeys.has(counter.featureKey)) {
        await ctx.db.patch(counter._id, {
          count: 0,
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
          resetAt: Date.now(),
        });
      }
    }
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

    // Prevent grace period abuse: enforce 30-day cooldown between grace periods
    const recentGrace = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();
    if (recentGrace && now - recentGrace.createdAt < 30 * 24 * 60 * 60 * 1000) {
      // Previous grace period was created less than 30 days ago — skip
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
    const active = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const now = Date.now();
    const defaultTier = await getDefaultTierName(ctx.db);

    for (const g of active) {
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
      }
    }
  },
});

/**
 * Log billing event (payment success/failure)
 */
export const logBillingEvent = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    action: v.union(
      v.literal("billing.payment_succeeded"),
      v.literal("billing.payment_failed")
    ),
    details: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.userId,
      action: args.action,
      details: args.details,
      createdAt: now,
    });
  },
});

// ==========================================
// WEBHOOK ACTION (public gateway for Stripe webhook handler)
// ==========================================

/** Grace period duration in days. */
const GRACE_PERIOD_DAYS = 7;

/**
 * Process a Stripe webhook event.
 *
 * This is the single public entry point for all Stripe webhook events.
 * The Next.js webhook route verifies the Stripe signature, then calls
 * this action with the event type and serialized data.
 *
 * USER-LEVEL BILLING: All tier syncs write to userTiers (the single
 * source of truth for billing tier assignment).
 *
 * This action dispatches to internal mutations — no billing mutation
 * is directly callable from the client.
 */
export const processWebhookEvent = action({
  args: {
    type: v.string(),
    data: v.string(), // JSON-serialized Stripe event data object
  },
  handler: async (ctx, args) => {
    const eventData = JSON.parse(args.data);

    switch (args.type) {
      case "checkout.session.completed": {
        const organizationId = eventData.metadata?.organizationId;
        const userId = eventData.metadata?.userId;

        if (!organizationId || !userId) {
          console.error("Missing metadata in checkout session:", eventData.id);
          return;
        }

        const customerId = eventData.customer as string;
        const customerEmail =
          eventData.customer_email || eventData.customer_details?.email;

        if (!customerId || !customerEmail) {
          console.error(
            "Missing customer data in checkout session:",
            eventData.id
          );
          return;
        }

        // Map Stripe customer to org and user
        await ctx.runMutation(internal.subscriptions.upsertStripeCustomer, {
          organizationId,
          userId,
          stripeCustomerId: customerId,
          email: customerEmail,
        });

        console.log("Stripe: checkout completed");
        break;
      }

      case "customer.subscription.created": {
        const customerId = eventData.customer as string;

        const stripeCustomer = await ctx.runQuery(
          internal.subscriptions._getStripeCustomerById,
          { stripeCustomerId: customerId }
        );

        if (!stripeCustomer) {
          console.error("No customer found for Stripe customer:", customerId);
          return;
        }

        const subscriptionItem = eventData.items?.data?.[0];
        const priceId = subscriptionItem?.price?.id;

        if (!priceId || !subscriptionItem) {
          console.error("No price found in subscription:", eventData.id);
          return;
        }

        // Resolve the user — prefer userId on stripeCustomer, fallback to org owner
        const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
          organizationId: stripeCustomer.organizationId,
        });
        const resolvedUserId = stripeCustomer.userId ?? org?.createdBy;

        if (!resolvedUserId) {
          console.error(
            "Could not resolve user for subscription:",
            eventData.id
          );
          return;
        }

        await ctx.runMutation(internal.subscriptions.createSubscription, {
          organizationId: stripeCustomer.organizationId,
          userId: resolvedUserId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: eventData.id,
          stripePriceId: priceId,
          status: eventData.status,
          currentPeriodStart: subscriptionItem.current_period_start * 1000,
          currentPeriodEnd: subscriptionItem.current_period_end * 1000,
          cancelAtPeriodEnd: eventData.cancel_at_period_end,
          cancelAt: eventData.cancel_at
            ? eventData.cancel_at * 1000
            : undefined,
          trialStart: eventData.trial_start
            ? eventData.trial_start * 1000
            : undefined,
          trialEnd: eventData.trial_end
            ? eventData.trial_end * 1000
            : undefined,
        });

        // Dynamic tier mapping from price ID
        const tierName = await ctx.runQuery(
          internal.subscriptions._mapPriceToTier,
          { priceId }
        );

        if (eventData.status === "active" || eventData.status === "trialing") {
          // Primary: sync user tier
          await ctx.runMutation(internal.subscriptions._syncUserTier, {
            userId: resolvedUserId,
            tier: tierName,
            reason: "billing.subscription_created",
          });

          // Reset consumption counters on new subscription
          await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
            userId: resolvedUserId,
            periodStart: subscriptionItem.current_period_start * 1000,
            periodEnd: subscriptionItem.current_period_end * 1000,
          });

          // Clear any active grace period
          await ctx.runMutation(internal.subscriptions._clearGracePeriod, {
            userId: resolvedUserId,
          });
        }

        console.log("Stripe: subscription created");
        break;
      }

      case "customer.subscription.updated": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByStripeSubscriptionId,
          { stripeSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          // Subscription doesn't exist yet — handle as new creation
          const customerId = eventData.customer as string;
          const stripeCustomer = await ctx.runQuery(
            internal.subscriptions._getStripeCustomerById,
            { stripeCustomerId: customerId }
          );

          if (!stripeCustomer) {
            console.error("No customer found for Stripe customer:", customerId);
            return;
          }

          const subItem = eventData.items?.data?.[0];
          const priceId = subItem?.price?.id;
          if (!priceId || !subItem) {
            console.error("No price found in subscription:", eventData.id);
            return;
          }

          const fallbackOrg = await ctx.runQuery(
            internal.subscriptions._getOrgById,
            { organizationId: stripeCustomer.organizationId }
          );
          const resolvedUserId =
            stripeCustomer.userId ?? fallbackOrg?.createdBy;

          if (!resolvedUserId) {
            console.error(
              "Could not resolve user for subscription:",
              eventData.id
            );
            return;
          }

          await ctx.runMutation(internal.subscriptions.createSubscription, {
            organizationId: stripeCustomer.organizationId,
            userId: resolvedUserId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: eventData.id,
            stripePriceId: priceId,
            status: eventData.status,
            currentPeriodStart: subItem.current_period_start * 1000,
            currentPeriodEnd: subItem.current_period_end * 1000,
            cancelAtPeriodEnd: eventData.cancel_at_period_end,
            cancelAt: eventData.cancel_at
              ? eventData.cancel_at * 1000
              : undefined,
            trialStart: eventData.trial_start
              ? eventData.trial_start * 1000
              : undefined,
            trialEnd: eventData.trial_end
              ? eventData.trial_end * 1000
              : undefined,
          });

          const tierName = await ctx.runQuery(
            internal.subscriptions._mapPriceToTier,
            { priceId }
          );

          if (
            eventData.status === "active" ||
            eventData.status === "trialing"
          ) {
            await ctx.runMutation(internal.subscriptions._syncUserTier, {
              userId: resolvedUserId,
              tier: tierName,
              reason: "billing.subscription_created",
            });
            await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
              userId: resolvedUserId,
              periodStart: subItem.current_period_start * 1000,
              periodEnd: subItem.current_period_end * 1000,
            });
            await ctx.runMutation(internal.subscriptions._clearGracePeriod, {
              userId: resolvedUserId,
            });
          }

          console.log("Stripe: subscription created (from update fallback)");
          return;
        }

        const previousStatus = existingSubscription.status;
        const newStatus = eventData.status;
        const subscriptionItem = eventData.items?.data?.[0];

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          stripeSubscriptionId: eventData.id,
          status: newStatus,
          currentPeriodStart: subscriptionItem
            ? subscriptionItem.current_period_start * 1000
            : undefined,
          currentPeriodEnd: subscriptionItem
            ? subscriptionItem.current_period_end * 1000
            : undefined,
          cancelAtPeriodEnd: eventData.cancel_at_period_end,
          cancelAt: eventData.cancel_at
            ? eventData.cancel_at * 1000
            : undefined,
          trialEnd: eventData.trial_end
            ? eventData.trial_end * 1000
            : undefined,
        });

        // Determine tier from price
        const priceId = subscriptionItem?.price?.id;
        const previousTierName = priceId
          ? await ctx.runQuery(internal.subscriptions._mapPriceToTier, {
              priceId: existingSubscription.stripePriceId,
            })
          : "free";
        const newTierName = priceId
          ? await ctx.runQuery(internal.subscriptions._mapPriceToTier, {
              priceId,
            })
          : "free";

        // Resolve userId from subscription or org owner
        const resolvedUserId =
          existingSubscription.userId ??
          (
            await ctx.runQuery(internal.subscriptions._getOrgById, {
              organizationId: existingSubscription.organizationId,
            })
          )?.createdBy;

        if (!resolvedUserId) {
          console.error(
            "Could not resolve user for subscription update:",
            eventData.id
          );
          return;
        }

        // Check if status changed to active (renewal / reactivation)
        const wasActive =
          previousStatus === "active" || previousStatus === "trialing";
        const isNowActive = newStatus === "active" || newStatus === "trialing";

        if (isNowActive && !wasActive) {
          // Reactivated — sync tier up, reset counters, clear grace
          await ctx.runMutation(internal.subscriptions._syncUserTier, {
            userId: resolvedUserId,
            tier: newTierName,
            reason: "billing.subscription_updated",
          });
          if (subscriptionItem) {
            await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
              userId: resolvedUserId,
              periodStart: subscriptionItem.current_period_start * 1000,
              periodEnd: subscriptionItem.current_period_end * 1000,
            });
          }
          await ctx.runMutation(internal.subscriptions._clearGracePeriod, {
            userId: resolvedUserId,
          });
        } else if (isNowActive && previousTierName !== newTierName) {
          // Tier changed (upgrade/downgrade between paid tiers)
          await ctx.runMutation(internal.subscriptions._syncUserTier, {
            userId: resolvedUserId,
            tier: newTierName,
            reason: "billing.subscription_updated",
          });
        } else if (!isNowActive && wasActive) {
          // Deactivated — will be handled by subscription.deleted or grace period
        }

        console.log("Stripe: subscription updated");
        break;
      }

      case "customer.subscription.deleted": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByStripeSubscriptionId,
          { stripeSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Stripe: subscription not found for deletion");
          return;
        }

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          stripeSubscriptionId: eventData.id,
          status: "canceled",
          cancelAtPeriodEnd: false,
        });

        // Resolve user
        const resolvedUserId =
          existingSubscription.userId ??
          (
            await ctx.runQuery(internal.subscriptions._getOrgById, {
              organizationId: existingSubscription.organizationId,
            })
          )?.createdBy;

        if (resolvedUserId) {
          // Get user's current tier before downgrade
          const currentTier = await ctx.runQuery(
            internal.subscriptions._getUserTierName,
            { userId: resolvedUserId }
          );

          // Start grace period instead of immediate downgrade
          await ctx.runMutation(internal.subscriptions._createGracePeriod, {
            userId: resolvedUserId,
            previousTier: currentTier,
            gracePeriodDays: GRACE_PERIOD_DAYS,
          });
        }

        console.log("Stripe: subscription deleted (grace period started)");
        break;
      }

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        // Extract subscription ID from invoice (Stripe SDK v20+ structure)
        let subscriptionId: string | null = null;
        if (eventData.parent?.subscription_details) {
          const sub = eventData.parent.subscription_details.subscription;
          subscriptionId = typeof sub === "string" ? sub : sub?.id || null;
        }

        if (!subscriptionId) return;

        const subscription = await ctx.runQuery(
          internal.subscriptions._getByStripeSubscriptionId,
          { stripeSubscriptionId: subscriptionId }
        );

        if (!subscription) {
          console.log("Stripe: subscription not found for payment event");
          return;
        }

        const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
          organizationId: subscription.organizationId,
        });

        if (org) {
          const billingAction =
            args.type === "invoice.payment_succeeded"
              ? ("billing.payment_succeeded" as const)
              : ("billing.payment_failed" as const);

          const details =
            args.type === "invoice.payment_succeeded"
              ? JSON.stringify({
                  invoiceId: eventData.id,
                  amount: eventData.amount_paid,
                  currency: eventData.currency,
                })
              : JSON.stringify({
                  invoiceId: eventData.id,
                  amount: eventData.amount_due,
                  currency: eventData.currency,
                  attemptCount: eventData.attempt_count,
                });

          await ctx.runMutation(internal.subscriptions.logBillingEvent, {
            organizationId: subscription.organizationId,
            userId: org.createdBy,
            action: billingAction,
            details,
          });

          // On successful payment, reset usage counters
          if (
            args.type === "invoice.payment_succeeded" &&
            subscription.userId
          ) {
            await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
              userId: subscription.userId,
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
            });
          }
        }

        console.log(`Stripe: ${args.type}`);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${args.type}`);
    }
  },
});

// ==========================================
// INTERNAL QUERIES (used by processWebhookEvent action)
// ==========================================

export const _getStripeCustomerById = internalQuery({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeCustomers")
      .withIndex("by_stripe_customer", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
  },
});

export const _getByStripeSubscriptionId = internalQuery({
  args: { stripeSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId)
      )
      .first();
  },
});

export const _getOrgById = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/**
 * Dynamic price-to-tier mapping query (used in action context)
 */
export const _mapPriceToTier = internalQuery({
  args: { priceId: v.string() },
  handler: async (ctx, args) => {
    return await mapPriceIdToTier(ctx.db, args.priceId);
  },
});

/**
 * Get user's current tier name (used in action context)
 */
export const _getUserTierName = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await getUserTier(ctx.db, args.userId);
  },
});

// ==========================================
// PUBLIC MUTATIONS (for user-initiated actions)
// ==========================================

/**
 * Store checkout session metadata
 * Called before redirecting to Stripe checkout.
 * Now checks user-level subscription status alongside org-level.
 */
export const prepareCheckout = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user has admin access to the organization
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership || membership.role !== "admin") {
      throw new Error("Only organization admins can manage billing");
    }

    // Check if user already has active subscription
    const userSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (
      userSubscription &&
      (userSubscription.status === "active" ||
        userSubscription.status === "trialing")
    ) {
      throw new Error("You already have an active subscription");
    }

    // Fallback: check org-level subscription (legacy)
    const orgSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (
      orgSubscription &&
      (orgSubscription.status === "active" ||
        orgSubscription.status === "trialing")
    ) {
      throw new Error("Organization already has an active subscription");
    }

    // Get Stripe customer — prefer user-level, fallback to org-level
    const userCustomer = await ctx.db
      .query("stripeCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const orgCustomer = userCustomer
      ? null
      : await ctx.db
          .query("stripeCustomers")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .first();

    return {
      organizationId: args.organizationId,
      stripeCustomerId:
        userCustomer?.stripeCustomerId || orgCustomer?.stripeCustomerId || null,
    };
  },
});
