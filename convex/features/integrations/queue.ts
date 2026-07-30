import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

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
  return true;
}
