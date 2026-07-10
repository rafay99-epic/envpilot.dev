import { v } from "convex/values";
import { action, internalMutation } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Subscription webhook processing for Polar.sh Integration.
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
 * Shared subscription-activation flow for the `subscription.created` /
 * `subscription.active` case and the `subscription.updated` new-subscription
 * fallback. Both branches ran byte-identical multi-strategy user/org
 * resolution + customer upsert + subscription creation + (if active/trialing)
 * tier-sync / reset-counters / clear-grace. Extracted verbatim; the only
 * per-branch differences — the error-log key prefix (`logKeyInfix`), whether
 * the `unresolvedUser` log includes `customerId`
 * (`includeCustomerIdOnUnresolvedUser`), and the trailing success log +
 * break/return — stay at the two call sites so observable behavior (DB writes,
 * write order, and every console.error/console.log message) is unchanged.
 *
 * Returns `{ userId, tierName }` on success, or `null` if the event could not
 * be resolved (a console.error matching the original per-branch message is
 * emitted here in that case).
 */
async function activateSubscriptionFromEvent(
  ctx: ActionCtx,
  eventData: any,
  eventType: string,
  logKeyInfix: string,
  includeCustomerIdOnUnresolvedUser: boolean
): Promise<{ userId: string; tierName: string } | null> {
  const customerId = eventData.customerId as string;
  const productId = eventData.productId as string;

  if (!productId) {
    console.error(`subscriptions.processWebhookEvent.${logKeyInfix}noProduct`, {
      eventType,
      eventId: eventData.id,
    });
    return null;
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
      internal.features.billing.queries._getPolarCustomerById,
      { polarCustomerId: customerId }
    );
    if (polarCustomer) {
      resolvedUserId = polarCustomer.userId ?? undefined;
      resolvedOrgId = resolvedOrgId ?? polarCustomer.organizationId;
    }
  }

  if (!resolvedUserId) {
    console.error(
      `subscriptions.processWebhookEvent.${logKeyInfix}unresolvedUser`,
      includeCustomerIdOnUnresolvedUser
        ? {
            eventType,
            eventId: eventData.id,
            customerId,
          }
        : {
            eventType,
            eventId: eventData.id,
          }
    );
    return null;
  }

  // Resolve org ID — if we still don't have one, look up user's first org
  if (!resolvedOrgId) {
    const userOrgs = await ctx.runQuery(
      internal.features.billing.queries._getUserOwnedOrgs,
      { userId: resolvedUserId as any }
    );
    if (userOrgs.length > 0) {
      resolvedOrgId = userOrgs[0]._id;
    }
  }

  if (!resolvedOrgId) {
    console.error(
      `subscriptions.processWebhookEvent.${logKeyInfix}unresolvedOrganization`,
      {
        eventType,
        eventId: eventData.id,
      }
    );
    return null;
  }

  // Ensure polarCustomers record exists (handles race condition)
  await ctx.runMutation(
    internal.features.billing.webhooks.upsertPolarCustomer,
    {
      organizationId: resolvedOrgId as any,
      userId: resolvedUserId as any,
      polarCustomerId: customerId,
      email:
        eventData.customer?.email ??
        eventData.customerEmail ??
        "unknown@polar.sh",
    }
  );

  await ctx.runMutation(internal.features.billing.webhooks.createSubscription, {
    organizationId: resolvedOrgId as any,
    userId: resolvedUserId as any,
    polarCustomerId: customerId,
    polarSubscriptionId: eventData.id,
    polarProductId: productId,
    status: eventData.status,
    currentPeriodStart:
      polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
    currentPeriodEnd: polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
    cancelAtPeriodEnd: eventData.cancelAtPeriodEnd ?? false,
    cancelAt: polarTimestamp(eventData.endsAt),
    trialStart: polarTimestamp(eventData.startedAt),
    trialEnd: polarTimestamp(eventData.endsAt),
  });

  // Dynamic tier mapping from product ID
  const tierName = await ctx.runQuery(
    internal.features.billing.queries._mapProductToTier,
    { productId }
  );

  if (eventData.status === "active" || eventData.status === "trialing") {
    // Primary: sync user tier (user-level, not org-level)
    await ctx.runMutation(internal.features.billing.webhooks._syncUserTier, {
      userId: resolvedUserId as any,
      tier: tierName,
      reason: "billing.subscription_created",
    });

    // Reset consumption counters on new subscription
    await ctx.runMutation(
      internal.features.billing.gracePeriods._resetUsageCounters,
      {
        userId: resolvedUserId as any,
        periodStart: polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
        periodEnd: polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
      }
    );

    // Clear any active grace period
    await ctx.runMutation(
      internal.features.billing.gracePeriods._clearGracePeriod,
      {
        userId: resolvedUserId as any,
      }
    );
  }

  return { userId: resolvedUserId, tierName };
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
        internal.features.billing.queries._checkWebhookProcessed,
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
          console.error("subscriptions.processWebhookEvent.missingMetadata", {
            eventType: args.type,
            eventId: eventData.id,
          });
          return;
        }

        const customerId = eventData.customerId as string;
        const customerEmail =
          eventData.customerEmail || eventData.customer?.email;

        if (!customerId || !customerEmail) {
          console.error(
            "subscriptions.processWebhookEvent.missingCustomerData",
            {
              eventType: args.type,
              eventId: eventData.id,
            }
          );
          return;
        }

        // Map Polar customer to org and user
        await ctx.runMutation(
          internal.features.billing.webhooks.upsertPolarCustomer,
          {
            organizationId,
            userId,
            polarCustomerId: customerId,
            email: customerEmail,
          }
        );

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
        const result = await activateSubscriptionFromEvent(
          ctx,
          eventData,
          args.type,
          "",
          true
        );
        if (!result) return;

        console.log(
          `Polar: ${args.type} — user ${result.userId} → tier ${result.tierName}`
        );
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION UPDATED — handle tier changes
      // -----------------------------------------------
      case "subscription.updated": {
        const existingSubscription = await ctx.runQuery(
          internal.features.billing.queries._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          // Subscription doesn't exist yet — handle as new creation
          // Use same multi-strategy user resolution as subscription.created
          const result = await activateSubscriptionFromEvent(
            ctx,
            eventData,
            args.type,
            "updateFallback.",
            false
          );
          if (!result) return;

          console.log(
            `Polar: subscription created (from update fallback) — user ${result.userId}`
          );
          // break (not return) so the successful fallback activation falls
          // through to the record-processed step below — otherwise a Polar
          // redelivery of this event would re-run the whole activation
          // (tier sync, counter reset, billing log).
          break;
        }

        const previousStatus = existingSubscription.status;
        const newStatus = eventData.status;
        const productId = eventData.productId as string;

        await ctx.runMutation(
          internal.features.billing.webhooks.updateSubscription,
          {
            polarSubscriptionId: eventData.id,
            status: newStatus,
            currentPeriodStart: polarTimestamp(eventData.currentPeriodStart),
            currentPeriodEnd: polarTimestamp(eventData.currentPeriodEnd),
            cancelAtPeriodEnd: eventData.cancelAtPeriodEnd,
            cancelAt: polarTimestamp(eventData.endsAt),
            trialEnd: polarTimestamp(eventData.endsAt),
          }
        );

        // Determine tier from product
        const previousTierName = await ctx.runQuery(
          internal.features.billing.queries._mapProductToTier,
          { productId: existingSubscription.polarProductId }
        );
        const newTierName = productId
          ? await ctx.runQuery(
              internal.features.billing.queries._mapProductToTier,
              {
                productId,
              }
            )
          : "free";

        // Resolve userId from subscription or org owner
        const resolvedUserId =
          existingSubscription.userId ??
          (
            await ctx.runQuery(internal.features.billing.queries._getOrgById, {
              organizationId: existingSubscription.organizationId,
            })
          )?.createdBy;

        if (!resolvedUserId) {
          console.error(
            "subscriptions.processWebhookEvent.update.unresolvedUser",
            {
              eventType: args.type,
              eventId: eventData.id,
            }
          );
          return;
        }

        // Check if status changed to active (renewal / reactivation)
        const wasActive =
          previousStatus === "active" || previousStatus === "trialing";
        const isNowActive = newStatus === "active" || newStatus === "trialing";

        if (isNowActive && !wasActive) {
          // Reactivated — sync tier up, reset counters, clear grace
          await ctx.runMutation(
            internal.features.billing.webhooks._syncUserTier,
            {
              userId: resolvedUserId,
              tier: newTierName,
              reason: "billing.subscription_updated",
            }
          );
          await ctx.runMutation(
            internal.features.billing.gracePeriods._resetUsageCounters,
            {
              userId: resolvedUserId,
              periodStart:
                polarTimestamp(eventData.currentPeriodStart) ?? Date.now(),
              periodEnd:
                polarTimestamp(eventData.currentPeriodEnd) ?? Date.now(),
            }
          );
          await ctx.runMutation(
            internal.features.billing.gracePeriods._clearGracePeriod,
            {
              userId: resolvedUserId,
            }
          );
        } else if (isNowActive && previousTierName !== newTierName) {
          // Tier changed (upgrade/downgrade between paid tiers)
          await ctx.runMutation(
            internal.features.billing.webhooks._syncUserTier,
            {
              userId: resolvedUserId,
              tier: newTierName,
              reason: "billing.subscription_updated",
            }
          );
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
          internal.features.billing.queries._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for cancellation");
          return;
        }

        await ctx.runMutation(
          internal.features.billing.webhooks.updateSubscription,
          {
            polarSubscriptionId: eventData.id,
            status: "canceled",
            cancelAtPeriodEnd: true,
            cancelAt: polarTimestamp(eventData.endsAt),
          }
        );

        console.log("Polar: subscription canceled (will end at period end)");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION UNCANCELED — cancellation reversed
      // -----------------------------------------------
      case "subscription.uncanceled": {
        const existingSubscription = await ctx.runQuery(
          internal.features.billing.queries._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for uncancellation");
          return;
        }

        await ctx.runMutation(
          internal.features.billing.webhooks.updateSubscription,
          {
            polarSubscriptionId: eventData.id,
            status: eventData.status ?? "active",
            cancelAtPeriodEnd: false,
          }
        );

        console.log("Polar: subscription uncanceled");
        break;
      }

      // -----------------------------------------------
      // SUBSCRIPTION REVOKED — final termination
      // Start grace period (matches Stripe subscription.deleted)
      // -----------------------------------------------
      case "subscription.revoked": {
        const existingSubscription = await ctx.runQuery(
          internal.features.billing.queries._getByPolarSubscriptionId,
          { polarSubscriptionId: eventData.id }
        );

        if (!existingSubscription) {
          console.log("Polar: subscription not found for revocation");
          return;
        }

        await ctx.runMutation(
          internal.features.billing.webhooks.updateSubscription,
          {
            polarSubscriptionId: eventData.id,
            status: "revoked",
            cancelAtPeriodEnd: false,
          }
        );

        // Resolve user
        const resolvedUserId =
          existingSubscription.userId ??
          (
            await ctx.runQuery(internal.features.billing.queries._getOrgById, {
              organizationId: existingSubscription.organizationId,
            })
          )?.createdBy;

        if (resolvedUserId) {
          // Get user's current tier before downgrade
          const currentTier = await ctx.runQuery(
            internal.features.billing.queries._getUserTierName,
            { userId: resolvedUserId }
          );

          // Start grace period instead of immediate downgrade
          await ctx.runMutation(
            internal.features.billing.gracePeriods._createGracePeriod,
            {
              userId: resolvedUserId,
              previousTier: currentTier,
              gracePeriodDays: GRACE_PERIOD_DAYS,
            }
          );
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
          internal.features.billing.queries._getByPolarSubscriptionId,
          { polarSubscriptionId: subscriptionId }
        );

        if (!subscription) {
          console.log("Polar: subscription not found for payment event");
          return;
        }

        const org = await ctx.runQuery(
          internal.features.billing.queries._getOrgById,
          {
            organizationId: subscription.organizationId,
          }
        );

        if (org) {
          await ctx.runMutation(
            internal.features.billing.webhooks.logBillingEvent,
            {
              organizationId: subscription.organizationId,
              userId: org.createdBy,
              action: "billing.payment_succeeded",
              details: JSON.stringify({
                orderId: eventData.id,
                amount: eventData.totalAmount,
                currency: eventData.currency,
                billingReason: eventData.billingReason,
              }),
            }
          );

          // On successful payment, reset usage counters
          if (subscription.userId) {
            await ctx.runMutation(
              internal.features.billing.gracePeriods._resetUsageCounters,
              {
                userId: subscription.userId,
                periodStart: subscription.currentPeriodStart,
                periodEnd: subscription.currentPeriodEnd,
              }
            );
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
      await ctx.runMutation(
        internal.features.billing.webhooks._recordWebhookProcessed,
        {
          webhookId: args.webhookId,
          eventType: args.type,
        }
      );
    }
  },
});

// ==========================================
// WEBHOOK DEDUPLICATION
// ==========================================

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
      .withIndex("by_processed_at", (q) => q.lt("processedAt", sevenDaysAgo))
      .collect();

    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
    }

    if (oldEvents.length > 0) {
      console.log(`Cleaned up ${oldEvents.length} processed webhook events`);
    }
  },
});
