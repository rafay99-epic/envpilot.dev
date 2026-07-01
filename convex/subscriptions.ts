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
import type { Doc } from "./_generated/dataModel";
import { getDefaultTierName, isCronPaused } from "./tierLimits";
import { getUserTier } from "./featureRegistry";
import { normalizeOrgRole } from "./authz";

/**
 * Subscription Management for Polar.sh Integration
 *
 * USER-LEVEL BILLING: Subscriptions and Polar customers are keyed by
 * userId. The org owner's subscription determines the tier for all
 * their owned organizations via the userTiers table.
 *
 * SECURITY: All webhook mutations are internalMutation — they cannot be
 * called from the client. Only the processWebhookEvent action (which is
 * called from the verified Polar webhook handler) dispatches to them.
 */

// Subscription status type (matches Polar's subscription statuses)
export const subscriptionStatus = v.union(
  v.literal("active"),
  v.literal("canceled"),
  v.literal("incomplete"),
  v.literal("past_due"),
  v.literal("trialing"),
  v.literal("unpaid"),
  v.literal("revoked")
);

// ==========================================
// DYNAMIC PRODUCT-TO-TIER MAPPING
// ==========================================

/**
 * Maps a Polar product ID to a tier name by looking up tierDefinitions.
 * Falls back to default tier if no match found.
 */
async function mapProductIdToTier(
  db: DatabaseReader,
  productId: string
): Promise<string> {
  // Strategy 1: Look up in paymentProducts table (provider-agnostic)
  const paymentProduct = await db
    .query("paymentProducts")
    .withIndex("by_product_id", (q) => q.eq("productId", productId))
    .first();
  if (paymentProduct && paymentProduct.isActive) return paymentProduct.tierName;

  // Strategy 2: Legacy fallback — tierDefinitions.polarProductId
  const allTiers = await db.query("tierDefinitions").collect();
  const match = allTiers.find((t) => t.polarProductId === productId);
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
 * Get subscription by Polar subscription ID
 */
export const getByPolarSubscriptionId = query({
  args: { polarSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
      )
      .first();
  },
});

/**
 * Get Polar customer for an organization (LEGACY — backward compat)
 */
export const getPolarCustomer = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
  },
});

/**
 * Get Polar customer for a user (NEW)
 */
export const getPolarCustomerByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

/**
 * Get Polar customer by Polar customer ID
 */
export const getPolarCustomerById = query({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId)
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
 * Create or update a Polar customer mapping
 */
export const upsertPolarCustomer = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    polarCustomerId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Try to find by user first, then by org
    let existing = await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (!existing) {
      existing = await ctx.db
        .query("polarCustomers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .first();
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        polarCustomerId: args.polarCustomerId,
        email: args.email,
        userId: args.userId,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("polarCustomers", {
      organizationId: args.organizationId,
      userId: args.userId,
      polarCustomerId: args.polarCustomerId,
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
    polarCustomerId: v.string(),
    polarSubscriptionId: v.string(),
    polarProductId: v.string(),
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
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
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
    const subscriptionId = await ctx.db.insert("subscriptions", {
      organizationId: args.organizationId,
      userId: args.userId,
      polarCustomerId: args.polarCustomerId,
      polarSubscriptionId: args.polarSubscriptionId,
      polarProductId: args.polarProductId,
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

    // Audit: new subscription activated
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "billing.subscription_created",
      details: JSON.stringify({
        polarSubscriptionId: args.polarSubscriptionId,
        polarProductId: args.polarProductId,
        status: args.status,
      }),
      createdAt: now,
    });

    return subscriptionId;
  },
});

/**
 * Update a subscription from Polar webhook
 */
export const updateSubscription = internalMutation({
  args: {
    polarSubscriptionId: v.string(),
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
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
      )
      .first();

    if (!subscription) {
      throw new Error(`Subscription not found: ${args.polarSubscriptionId}`);
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

    // Audit: subscription lifecycle change
    const actorUserId =
      subscription.userId ??
      (await ctx.db.get(subscription.organizationId))?.createdBy;

    if (actorUserId) {
      const becameInactive =
        (args.status === "canceled" || args.status === "revoked") &&
        subscription.status !== args.status;

      await ctx.db.insert("auditLogs", {
        organizationId: subscription.organizationId,
        userId: actorUserId,
        action: becameInactive
          ? "billing.subscription_canceled"
          : "billing.subscription_updated",
        details: JSON.stringify({
          polarSubscriptionId: args.polarSubscriptionId,
          previousStatus: subscription.status,
          newStatus: args.status,
          cancelAtPeriodEnd: args.cancelAtPeriodEnd,
        }),
        createdAt: now,
      });
    }

    return subscription._id;
  },
});

/**
 * Delete a subscription (when customer is deleted in Polar)
 */
export const deleteSubscription = internalMutation({
  args: {
    polarSubscriptionId: v.string(),
  },
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
      )
      .first();

    if (subscription) {
      await ctx.db.delete(subscription._id);

      // Audit: subscription removed (customer deleted in Polar)
      const actorUserId =
        subscription.userId ??
        (await ctx.db.get(subscription.organizationId))?.createdBy;

      if (actorUserId) {
        await ctx.db.insert("auditLogs", {
          organizationId: subscription.organizationId,
          userId: actorUserId,
          action: "billing.subscription_canceled",
          details: JSON.stringify({
            polarSubscriptionId: args.polarSubscriptionId,
            deleted: true,
          }),
          createdAt: Date.now(),
        });
      }
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
      .collect()
      .then((rows) => rows.filter((doc) => doc.resettable === true));
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
    if (await isCronPaused(ctx.db, "cron_pause_expire_grace_periods")) return;

    const active = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    const now = Date.now();
    const defaultTier = await getDefaultTierName(ctx.db);

    // Lazily loaded org list for audit-log context
    // (organizations has no index on createdBy)
    let allOrgs: Doc<"organizations">[] | null = null;

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

        // Audit: tier downgraded after grace period expiry
        if (allOrgs === null) {
          allOrgs = await ctx.db.query("organizations").collect();
        }
        const ownedOrg = allOrgs.find((o) => o.createdBy === g.userId);
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
// WEBHOOK ACTION (public gateway for Polar webhook handler)
// ==========================================

/** Grace period duration in days. */
const GRACE_PERIOD_DAYS = 7;

/**
 * Helper: Parse Polar ISO 8601 timestamp to milliseconds.
 * Polar sends dates as ISO strings, not Unix seconds like Stripe.
 */
function polarTimestamp(ts: string | null | undefined): number | undefined {
  if (!ts) return undefined;
  const ms = new Date(ts).getTime();
  return isNaN(ms) ? undefined : ms;
}

/**
 * Process a Polar webhook event.
 *
 * This is the single public entry point for all Polar webhook events.
 * The Next.js webhook route verifies the Polar signature, then calls
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
    data: v.string(), // JSON-serialized Polar event data object
    webhookId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const eventData = JSON.parse(args.data);

    // --- Webhook deduplication ---
    if (args.webhookId) {
      const alreadyProcessed = await ctx.runQuery(
        internal.subscriptions._checkWebhookProcessed,
        { webhookId: args.webhookId }
      );
      if (alreadyProcessed) {
        console.log(`Polar: skipping duplicate webhook ${args.webhookId}`);
        return;
      }
    }

    switch (args.type) {
      // -----------------------------------------------
      // CHECKOUT COMPLETED — link Polar customer to user
      // -----------------------------------------------
      case "checkout.updated": {
        // Only process successful checkouts
        if (eventData.status !== "succeeded") {
          return;
        }

        const metadata = eventData.metadata || {};
        const organizationId = metadata.organizationId;
        const userId = metadata.userId;

        if (!organizationId || !userId) {
          console.error("Missing metadata in checkout:", eventData.id);
          return;
        }

        const customerId = eventData.customerId as string;
        const customerEmail =
          eventData.customerEmail || eventData.customer?.email;

        if (!customerId || !customerEmail) {
          console.error("Missing customer data in checkout:", eventData.id);
          return;
        }

        // Map Polar customer to org and user
        await ctx.runMutation(internal.subscriptions.upsertPolarCustomer, {
          organizationId,
          userId,
          polarCustomerId: customerId,
          email: customerEmail,
        });

        console.log("Polar: checkout completed");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION CREATED / ACTIVE — activate tier
      //
      // User resolution strategy (handles race condition where
      // subscription.created arrives before checkout.updated):
      //   1. metadata.userId from checkout (most reliable)
      //   2. customer.externalId (set to Convex userId at checkout)
      //   3. polarCustomers table lookup (fallback)
      // -----------------------------------------------
      case "subscription.created":
      case "subscription.active": {
        const customerId = eventData.customerId as string;
        const productId = eventData.productId as string;

        if (!productId) {
          console.error("No product found in subscription:", eventData.id);
          return;
        }

        // --- Resolve user ID using multiple strategies ---
        const metadata = eventData.metadata || {};
        const customerExternalId =
          eventData.customer?.externalId ?? eventData.externalCustomerId; // Embedded customer object // Top-level field

        let resolvedUserId: string | undefined;
        let resolvedOrgId: string | undefined;

        // Strategy 1: metadata from checkout (most reliable)
        if (metadata.userId) {
          resolvedUserId = metadata.userId;
          resolvedOrgId = metadata.organizationId;
        }

        // Strategy 2: customer.externalId (= Convex user ID, set at checkout)
        if (!resolvedUserId && customerExternalId) {
          resolvedUserId = customerExternalId;
        }

        // Strategy 3: polarCustomers table lookup (original approach)
        if (!resolvedUserId) {
          const polarCustomer = await ctx.runQuery(
            internal.subscriptions._getPolarCustomerById,
            { polarCustomerId: customerId }
          );
          if (polarCustomer) {
            resolvedUserId = polarCustomer.userId ?? undefined;
            resolvedOrgId = resolvedOrgId ?? polarCustomer.organizationId;
          }
        }

        if (!resolvedUserId) {
          console.error(
            "Could not resolve user for subscription:",
            eventData.id,
            "customerId:",
            customerId
          );
          return;
        }

        // Resolve org ID — if we still don't have one, look up user's first org
        if (!resolvedOrgId) {
          const userOrgs = await ctx.runQuery(
            internal.subscriptions._getUserOwnedOrgs,
            { userId: resolvedUserId as any }
          );
          if (userOrgs.length > 0) {
            resolvedOrgId = userOrgs[0]._id;
          }
        }

        if (!resolvedOrgId) {
          console.error(
            "Could not resolve organization for subscription:",
            eventData.id
          );
          return;
        }

        // Ensure polarCustomers record exists (handles race condition)
        await ctx.runMutation(internal.subscriptions.upsertPolarCustomer, {
          organizationId: resolvedOrgId as any,
          userId: resolvedUserId as any,
          polarCustomerId: customerId,
          email:
            eventData.customer?.email ??
            eventData.customerEmail ??
            "unknown@polar.sh",
        });

        await ctx.runMutation(internal.subscriptions.createSubscription, {
          organizationId: resolvedOrgId as any,
          userId: resolvedUserId as any,
          polarCustomerId: customerId,
          polarSubscriptionId: eventData.id,
          polarProductId: productId,
          status: eventData.status,
          currentPeriodStart:
            polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
          currentPeriodEnd:
            polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
          cancelAtPeriodEnd: eventData.cancelAtPeriodEnd ?? false,
          cancelAt: polarTimestamp(eventData.endsAt),
          trialStart: polarTimestamp(eventData.startedAt),
          trialEnd: polarTimestamp(eventData.endsAt),
        });

        // Dynamic tier mapping from product ID
        const tierName = await ctx.runQuery(
          internal.subscriptions._mapProductToTier,
          { productId }
        );

        if (eventData.status === "active" || eventData.status === "trialing") {
          // Primary: sync user tier (user-level, not org-level)
          await ctx.runMutation(internal.subscriptions._syncUserTier, {
            userId: resolvedUserId as any,
            tier: tierName,
            reason: "billing.subscription_created",
          });

          // Reset consumption counters on new subscription
          await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
            userId: resolvedUserId as any,
            periodStart:
              polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
            periodEnd: polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
          });

          // Clear any active grace period
          await ctx.runMutation(internal.subscriptions._clearGracePeriod, {
            userId: resolvedUserId as any,
          });
        }

        console.log(
          `Polar: ${args.type} — user ${resolvedUserId} → tier ${tierName}`
        );
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION UPDATED — handle tier changes
      // -----------------------------------------------
      case "subscription.updated": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          // Subscription doesn't exist yet — handle as new creation
          // Use same multi-strategy user resolution as subscription.created
          const customerId = eventData.customerId as string;
          const updMetadata = eventData.metadata || {};
          const updExternalId =
            eventData.customer?.externalId ?? eventData.externalCustomerId;

          const productId = eventData.productId as string;
          if (!productId) {
            console.error("No product found in subscription:", eventData.id);
            return;
          }

          let resolvedUserId: string | undefined;
          let resolvedOrgId: string | undefined;

          // Strategy 1: metadata
          if (updMetadata.userId) {
            resolvedUserId = updMetadata.userId;
            resolvedOrgId = updMetadata.organizationId;
          }
          // Strategy 2: customer.externalId
          if (!resolvedUserId && updExternalId) {
            resolvedUserId = updExternalId;
          }
          // Strategy 3: polarCustomers table
          if (!resolvedUserId) {
            const polarCustomer = await ctx.runQuery(
              internal.subscriptions._getPolarCustomerById,
              { polarCustomerId: customerId }
            );
            if (polarCustomer) {
              resolvedUserId = polarCustomer.userId ?? undefined;
              resolvedOrgId = resolvedOrgId ?? polarCustomer.organizationId;
            }
          }

          if (!resolvedUserId) {
            console.error(
              "Could not resolve user for subscription (update fallback):",
              eventData.id
            );
            return;
          }

          // Resolve org
          if (!resolvedOrgId) {
            const userOrgs = await ctx.runQuery(
              internal.subscriptions._getUserOwnedOrgs,
              { userId: resolvedUserId as any }
            );
            if (userOrgs.length > 0) {
              resolvedOrgId = userOrgs[0]._id;
            }
          }

          if (!resolvedOrgId) {
            console.error(
              "Could not resolve org for subscription (update fallback):",
              eventData.id
            );
            return;
          }

          // Ensure polarCustomers record exists
          await ctx.runMutation(internal.subscriptions.upsertPolarCustomer, {
            organizationId: resolvedOrgId as any,
            userId: resolvedUserId as any,
            polarCustomerId: customerId,
            email:
              eventData.customer?.email ??
              eventData.customerEmail ??
              "unknown@polar.sh",
          });

          await ctx.runMutation(internal.subscriptions.createSubscription, {
            organizationId: resolvedOrgId as any,
            userId: resolvedUserId as any,
            polarCustomerId: customerId,
            polarSubscriptionId: eventData.id,
            polarProductId: productId,
            status: eventData.status,
            currentPeriodStart:
              polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
            currentPeriodEnd:
              polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
            cancelAtPeriodEnd: eventData.cancelAtPeriodEnd ?? false,
            cancelAt: polarTimestamp(eventData.endsAt),
            trialStart: polarTimestamp(eventData.startedAt),
            trialEnd: polarTimestamp(eventData.endsAt),
          });

          const tierName = await ctx.runQuery(
            internal.subscriptions._mapProductToTier,
            { productId }
          );

          if (
            eventData.status === "active" ||
            eventData.status === "trialing"
          ) {
            await ctx.runMutation(internal.subscriptions._syncUserTier, {
              userId: resolvedUserId as any,
              tier: tierName,
              reason: "billing.subscription_created",
            });
            await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
              userId: resolvedUserId as any,
              periodStart:
                polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
              periodEnd:
                polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
            });
            await ctx.runMutation(internal.subscriptions._clearGracePeriod, {
              userId: resolvedUserId as any,
            });
          }

          console.log(
            `Polar: subscription created (from update fallback) — user ${resolvedUserId}`
          );
          return;
        }

        const previousStatus = existingSubscription.status;
        const newStatus = eventData.status;
        const productId = eventData.productId as string;

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          polarSubscriptionId: eventData.id,
          status: newStatus,
          currentPeriodStart: polarTimestamp(eventData.currentPeriodStart),
          currentPeriodEnd: polarTimestamp(eventData.currentPeriodEnd),
          cancelAtPeriodEnd: eventData.cancelAtPeriodEnd,
          cancelAt: polarTimestamp(eventData.endsAt),
          trialEnd: polarTimestamp(eventData.endsAt),
        });

        // Determine tier from product
        const previousTierName = await ctx.runQuery(
          internal.subscriptions._mapProductToTier,
          { productId: existingSubscription.polarProductId }
        );
        const newTierName = productId
          ? await ctx.runQuery(internal.subscriptions._mapProductToTier, {
              productId,
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
          await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
            userId: resolvedUserId,
            periodStart:
              polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
            periodEnd: polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
          });
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
          // Deactivated — will be handled by subscription.revoked or grace period
        }

        console.log("Polar: subscription updated");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION CANCELED — user requested cancellation
      // Subscription still active until period end.
      // -----------------------------------------------
      case "subscription.canceled": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for cancellation");
          return;
        }

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          polarSubscriptionId: eventData.id,
          status: "canceled",
          cancelAtPeriodEnd: true,
          cancelAt: polarTimestamp(eventData.endsAt),
        });

        console.log("Polar: subscription canceled (will end at period end)");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION UNCANCELED — cancellation reversed
      // -----------------------------------------------
      case "subscription.uncanceled": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for uncancellation");
          return;
        }

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          polarSubscriptionId: eventData.id,
          status: eventData.status ?? "active",
          cancelAtPeriodEnd: false,
        });

        console.log("Polar: subscription uncanceled");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION REVOKED — final termination
      // Start grace period (matches Stripe subscription.deleted)
      // -----------------------------------------------
      case "subscription.revoked": {
        const existingSubscription = await ctx.runQuery(
          internal.subscriptions._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for revocation");
          return;
        }

        await ctx.runMutation(internal.subscriptions.updateSubscription, {
          polarSubscriptionId: eventData.id,
          status: "revoked",
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

        console.log("Polar: subscription revoked (grace period started)");
        break;
      }

      // -----------------------------------------------
      // ORDER PAID — payment succeeded
      // -----------------------------------------------
      case "order.paid": {
        const subscriptionId = eventData.subscriptionId as string | undefined;

        if (!subscriptionId) return;

        const subscription = await ctx.runQuery(
          internal.subscriptions._getByPolarSubscriptionId,
          { polarSubscriptionId: subscriptionId }
        );

        if (!subscription) {
          console.log("Polar: subscription not found for payment event");
          return;
        }

        const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
          organizationId: subscription.organizationId,
        });

        if (org) {
          await ctx.runMutation(internal.subscriptions.logBillingEvent, {
            organizationId: subscription.organizationId,
            userId: org.createdBy,
            action: "billing.payment_succeeded",
            details: JSON.stringify({
              orderId: eventData.id,
              amount: eventData.totalAmount,
              currency: eventData.currency,
              billingReason: eventData.billingReason,
            }),
          });

          // On successful payment, reset usage counters
          if (subscription.userId) {
            await ctx.runMutation(internal.subscriptions._resetUsageCounters, {
              userId: subscription.userId,
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
            });
          }
        }

        console.log("Polar: order paid");
        break;
      }

      default:
        console.log(`Unhandled Polar event type: ${args.type}`);
    }

    // --- Record processed webhook ---
    if (args.webhookId) {
      await ctx.runMutation(internal.subscriptions._recordWebhookProcessed, {
        webhookId: args.webhookId,
        eventType: args.type,
      });
    }
  },
});

// ==========================================
// INTERNAL QUERIES (used by processWebhookEvent action)
// ==========================================

export const _getPolarCustomerById = internalQuery({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId)
      )
      .first();
  },
});

export const _getByPolarSubscriptionId = internalQuery({
  args: { polarSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
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
 * Get organizations owned by a user (for resolving org from user ID).
 * Used when subscription events don't include org metadata.
 */
export const _getUserOwnedOrgs = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .collect()
      .then((rows) => rows.filter((doc) => doc.createdBy === args.userId));
  },
});

/**
 * Dynamic product-to-tier mapping query (used in action context)
 */
export const _mapProductToTier = internalQuery({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    return await mapProductIdToTier(ctx.db, args.productId);
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
// WEBHOOK DEDUPLICATION
// ==========================================

export const _checkWebhookProcessed = internalQuery({
  args: { webhookId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_webhook_id", (q) => q.eq("webhookId", args.webhookId))
      .first();
    return !!existing;
  },
});

export const _recordWebhookProcessed = internalMutation({
  args: { webhookId: v.string(), eventType: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("processedWebhookEvents", {
      webhookId: args.webhookId,
      eventType: args.eventType,
      processedAt: Date.now(),
    });
  },
});

/**
 * Clean up processed webhook events older than 7 days.
 * Called by the cron job to prevent table bloat.
 */
export const cleanupProcessedWebhooks = internalMutation({
  handler: async (ctx) => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const oldEvents = await ctx.db
      .query("processedWebhookEvents")
      .collect()
      .then((rows) => rows.filter((doc) => doc.processedAt < sevenDaysAgo));

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    if (oldEvents.length > 0) {
      console.log(`Cleaned up ${oldEvents.length} processed webhook events`);
    }
  },
});

// ==========================================
// PAYMENT PRODUCTS (Provider-agnostic product mapping)
// ==========================================

/**
 * Get the active product ID for a given tier and provider.
 * Used by checkout route to find the correct Polar product.
 */
export const getProductIdForTier = query({
  args: {
    tierName: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("paymentProducts")
      .withIndex("by_tier_and_provider", (q) =>
        q.eq("tierName", args.tierName).eq("provider", args.provider)
      )
      .first();
    return product?.isActive ? product.productId : null;
  },
});

// ==========================================
// PUBLIC MUTATIONS (for user-initiated actions)
// ==========================================

/**
 * Store checkout session metadata
 * Called before redirecting to Polar checkout.
 * Now checks user-level subscription status alongside org-level.
 */
export const prepareCheckout = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user is the organization owner
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId)
      )
      .first();

    if (!membership || normalizeOrgRole(membership.role) !== "owner") {
      throw new Error("Only the organization owner can manage billing");
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

    // Get Polar customer — prefer user-level, fallback to org-level
    const userCustomer = await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const orgCustomer = userCustomer
      ? null
      : await ctx.db
          .query("polarCustomers")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .first();

    return {
      organizationId: args.organizationId,
      polarCustomerId:
        userCustomer?.polarCustomerId || orgCustomer?.polarCustomerId || null,
    };
  },
});
