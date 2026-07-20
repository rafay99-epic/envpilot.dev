import { v } from "convex/values";
import { internalAction, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Webhook delivery — dumb POST + result recording.
 *
 * One payload format for both platforms: Discord officially accepts
 * Slack-format payloads when "/slack" is appended to a Discord webhook URL.
 * ponytail: Slack-compat rendering on Discord is plain; switch the discord
 * branch to native embeds if it ever disappoints.
 */

export const MAX_CONSECUTIVE_FAILURES = 20;

export const deliver = internalAction({
  args: {
    webhookId: v.id("orgWebhooks"),
    url: v.string(),
    type: v.union(v.literal("slack"), v.literal("discord")),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const base = args.url.replace(/\/+$/, "");
    const endpoint =
      args.type === "discord" && !base.endsWith("/slack")
        ? `${base}/slack`
        : base;

    let status = 0; // 0 = network failure, recorded like any non-2xx
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: args.text }),
      });
      status = res.status;
    } catch {
      status = 0;
    }

    await ctx.runMutation(
      internal.features.integrations.dispatch._recordDelivery,
      { webhookId: args.webhookId, status }
    );
    return null;
  },
});

export const _recordDelivery = internalMutation({
  args: { webhookId: v.id("orgWebhooks"), status: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) return null; // deleted while the delivery was in flight

    const ok = args.status >= 200 && args.status < 300;
    const failCount = ok ? 0 : hook.failCount + 1;
    await ctx.db.patch(args.webhookId, {
      failCount,
      lastStatus: args.status,
      ...(ok ? { lastSentAt: Date.now() } : {}),
      // A dead endpoint auto-disables instead of being hammered forever;
      // re-enabling from the UI resets the counter.
      ...(failCount >= MAX_CONSECUTIVE_FAILURES ? { enabled: false } : {}),
    });
    return null;
  },
});
