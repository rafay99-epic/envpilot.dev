import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  action,
} from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Subscription Management for Stripe Integration
 *
 * Handles all subscription-related operations including:
 * - Creating/updating subscriptions from Stripe webhooks
 * - Managing Stripe customer mappings
 * - Querying subscription status
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
// QUERIES (public, read-only — safe)
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
 */
export const createSubscription = internalMutation({
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
 * Update organization tier based on subscription status.
 * Writes to the organizationTiers table (not the organizations table).
 */
export const syncOrganizationTier = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    tier: v.string(),
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

    // Read current tier from organizationTiers table
    const tierRecord = await ctx.db
      .query("organizationTiers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    const previousTier = tierRecord?.tier ?? "free";

    // Update or create tier record
    if (tierRecord) {
      if (previousTier !== args.tier) {
        await ctx.db.patch(tierRecord._id, {
          tier: args.tier,
          updatedAt: now,
          updatedBy: args.userId,
          reason: args.action,
        });
      }
    } else {
      await ctx.db.insert("organizationTiers", {
        organizationId: args.organizationId,
        tier: args.tier,
        updatedAt: now,
        updatedBy: args.userId,
        reason: args.action,
      });
    }

    // Create audit log for billing action
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      userId: args.userId,
      action: args.action,
      details:
        args.details ||
        JSON.stringify({
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

/**
 * Maps Stripe subscription status to tier.
 * Active and trialing → "pro", everything else → "free".
 */
function mapStatusToTier(status: string): "free" | "pro" {
  if (status === "active" || status === "trialing") {
    return "pro";
  }
  return "free";
}

/**
 * Process a Stripe webhook event.
 *
 * This is the single public entry point for all Stripe webhook events.
 * The Next.js webhook route verifies the Stripe signature, then calls
 * this action with the event type and serialized data.
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

        await ctx.runMutation(internal.subscriptions.upsertStripeCustomer, {
          organizationId,
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
          console.error(
            "No organization found for Stripe customer:",
            customerId
          );
          return;
        }

        const subscriptionItem = eventData.items?.data?.[0];
        const priceId = subscriptionItem?.price?.id;

        if (!priceId || !subscriptionItem) {
          console.error("No price found in subscription:", eventData.id);
          return;
        }

        await ctx.runMutation(internal.subscriptions.createSubscription, {
          organizationId: stripeCustomer.organizationId,
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

        const newTier = mapStatusToTier(eventData.status);
        const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
          organizationId: stripeCustomer.organizationId,
        });

        if (org) {
          await ctx.runMutation(internal.subscriptions.syncOrganizationTier, {
            organizationId: stripeCustomer.organizationId,
            tier: newTier,
            userId: org.createdBy,
            action: "billing.subscription_created",
            details: JSON.stringify({
              subscriptionId: eventData.id,
              status: eventData.status,
              priceId,
            }),
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
            console.error(
              "No organization found for Stripe customer:",
              customerId
            );
            return;
          }

          const subItem = eventData.items?.data?.[0];
          const priceId = subItem?.price?.id;
          if (!priceId || !subItem) {
            console.error("No price found in subscription:", eventData.id);
            return;
          }

          await ctx.runMutation(internal.subscriptions.createSubscription, {
            organizationId: stripeCustomer.organizationId,
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

          const fallbackTier = mapStatusToTier(eventData.status);
          const fallbackOrg = await ctx.runQuery(
            internal.subscriptions._getOrgById,
            { organizationId: stripeCustomer.organizationId }
          );

          if (fallbackOrg) {
            await ctx.runMutation(internal.subscriptions.syncOrganizationTier, {
              organizationId: stripeCustomer.organizationId,
              tier: fallbackTier,
              userId: fallbackOrg.createdBy,
              action: "billing.subscription_created",
              details: JSON.stringify({
                subscriptionId: eventData.id,
                status: eventData.status,
                priceId,
              }),
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

        const previousTier = mapStatusToTier(previousStatus);
        const newTier = mapStatusToTier(newStatus);

        if (previousTier !== newTier) {
          const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
            organizationId: existingSubscription.organizationId,
          });

          if (org) {
            const tierAction =
              newTier === "pro"
                ? ("billing.tier_upgraded" as const)
                : ("billing.tier_downgraded" as const);

            await ctx.runMutation(internal.subscriptions.syncOrganizationTier, {
              organizationId: existingSubscription.organizationId,
              tier: newTier,
              userId: org.createdBy,
              action: tierAction,
              details: JSON.stringify({
                subscriptionId: eventData.id,
                previousStatus,
                newStatus,
              }),
            });
          }
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

        const org = await ctx.runQuery(internal.subscriptions._getOrgById, {
          organizationId: existingSubscription.organizationId,
        });

        if (org) {
          await ctx.runMutation(internal.subscriptions.syncOrganizationTier, {
            organizationId: existingSubscription.organizationId,
            tier: "free",
            userId: org.createdBy,
            action: "billing.subscription_canceled",
            details: JSON.stringify({
              subscriptionId: eventData.id,
              reason: "subscription_deleted",
            }),
          });
        }

        console.log("Stripe: subscription deleted");
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
