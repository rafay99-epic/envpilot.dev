import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { WEBHOOK_DELIVERY_RECOVERY_BATCH_SIZE } from "../../lib/integrationLimits";

// Slack incoming webhooks are commonly limited to roughly one message/second.
// Reserving a slightly wider per-endpoint lane also keeps Discord fanout calm.
const DELIVERY_SPACING_MS = 1_100;

/**
 * Reserve and schedule one delivery inside the caller's mutation.
 *
 * Writing nextDeliveryAt makes concurrent audit fanout mutations conflict and
 * retry serially, so every event gets a distinct slot for this webhook.
 */
export async function enqueueWebhookDelivery(
  ctx: MutationCtx,
  args: {
    webhookId: Id<"orgWebhooks">;
    text: string;
    attempt?: number;
    notBefore?: number;
    generation?: number;
  }
): Promise<boolean> {
  const hook = await ctx.db.get(args.webhookId);
  if (!hook || hook.deletedAt !== undefined || !hook.enabled) return false;
  const generation = hook.queueGeneration ?? 0;
  if (args.generation !== undefined && args.generation !== generation) {
    return false;
  }

  const now = Date.now();
  const scheduledAt = Math.max(
    now,
    hook.nextDeliveryAt ?? now,
    hook.deliveryEmbargoUntil ?? now,
    args.notBefore ?? now
  );
  await ctx.db.patch(args.webhookId, {
    nextDeliveryAt: scheduledAt + DELIVERY_SPACING_MS,
  });
  try {
    await ctx.scheduler.runAfter(
      Math.max(0, scheduledAt - now),
      internal.features.integrations.dispatch.deliver,
      {
        webhookId: args.webhookId,
        text: args.text,
        attempt: args.attempt,
        generation,
      }
    );
  } catch (error) {
    // Keep the payload durable when Convex refuses the schedule. Because this
    // insert is in the caller's transaction, a committed webhook/audit event
    // can never lose its corresponding delivery merely due to runAfter.
    console.error("Webhook delivery scheduling deferred", error);
    await ctx.db.insert("webhookDeliveryFallbacks", {
      webhookId: args.webhookId,
      text: args.text,
      attempt: args.attempt ?? 0,
      generation,
      notBefore: scheduledAt,
      createdAt: now,
    });
  }
  return true;
}

/** Retry scheduler-rejected deliveries without creating duplicate queue rows. */
export const recoverPendingDeliveries = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("webhookDeliveryFallbacks")
      .withIndex("by_not_before", (q) => q.lte("notBefore", now))
      .take(WEBHOOK_DELIVERY_RECOVERY_BATCH_SIZE);

    for (const delivery of pending) {
      const hook = await ctx.db.get(delivery.webhookId);
      if (
        !hook ||
        hook.deletedAt !== undefined ||
        !hook.enabled ||
        (hook.queueGeneration ?? 0) !== delivery.generation
      ) {
        await ctx.db.delete(delivery._id);
        continue;
      }

      try {
        await ctx.scheduler.runAfter(
          0,
          internal.features.integrations.dispatch.deliver,
          {
            webhookId: delivery.webhookId,
            text: delivery.text,
            attempt: delivery.attempt,
            generation: delivery.generation,
          }
        );
        await ctx.db.delete(delivery._id);
      } catch (error) {
        console.error("Webhook delivery recovery scheduling deferred", error);
      }
    }
    return null;
  },
});
