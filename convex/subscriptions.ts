import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Subscription Management for Stripe Integration
 *
 * Handles all subscription-related operations including:
 * - Creating/updating subscriptions from Stripe webhooks
 * - Managing Stripe customer mappings
 * - Querying subscription status
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
// QUERIES
// ==========================================

/**
 * Get subscription for an organization
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
 * Get Stripe customer for an organization
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
 * Check if organization has active subscription
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

    return subscription.status === "active" || subscription.status === "trialing";
  },
});

// ==========================================
// WEBHOOK MUTATIONS (called from webhook handlers)
// These are public mutations but should only be called from
// the verified Stripe webhook handler in /api/webhooks/stripe
// ==========================================

/**
 * Create or update a Stripe customer mapping
 * Called when a checkout session is completed
 */
export const upsertStripeCustomer = mutation({
  args: {
    organizationId: v.id("organizations"),
    stripeCustomerId: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("stripeCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId,
        email: args.email,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("stripeCustomers", {
      organizationId: args.organizationId,
      stripeCustomerId: args.stripeCustomerId,
      email: args.email,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Create a new subscription record
 * Called when a subscription is created via webhook
 */
export const createSubscription = mutation({
  args: {
    organizationId: v.id("organizations"),
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
export const updateSubscription = mutation({
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
export const deleteSubscription = mutation({
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
 * Update organization tier based on subscription status
 * Called after subscription changes to sync tier
 */
export const syncOrganizationTier = mutation({
  args: {
    organizationId: v.id("organizations"),
    tier: v.union(v.literal("free"), v.literal("pro")),
    userId: v.id("users"),
    action: v.union(
      v.literal("billing.tier_upgraded"),
      v.literal("billing.tier_downgraded"),
      v.literal("billing.subscription_created"),
      v.literal("billing.subscription_updated"),
      v.literal("billing.subscription_canceled")
    ),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const previousTier = org.tier;

    // Only update if tier actually changed
    if (previousTier !== args.tier) {
      await ctx.db.patch(args.organizationId, {
        tier: args.tier,
        updatedAt: now,
      });
    }

    // Create audit log for billing action
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.userId,
      action: args.action,
      details: args.details || JSON.stringify({
        previousTier,
        newTier: args.tier,
      }),
      createdAt: now,
    });

    return args.organizationId;
  },
});

/**
 * Log billing event (payment success/failure)
 */
export const logBillingEvent = mutation({
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
// PUBLIC MUTATIONS (for user-initiated actions)
// ==========================================

/**
 * Store checkout session metadata
 * Called before redirecting to Stripe checkout
 * This helps us map the checkout session back to the organization
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

    // Check if already has active subscription
    const existingSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (
      existingSubscription &&
      (existingSubscription.status === "active" ||
        existingSubscription.status === "trialing")
    ) {
      throw new Error("Organization already has an active subscription");
    }

    // Get or verify Stripe customer exists
    const stripeCustomer = await ctx.db
      .query("stripeCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    return {
      organizationId: args.organizationId,
      stripeCustomerId: stripeCustomer?.stripeCustomerId || null,
    };
  },
});
