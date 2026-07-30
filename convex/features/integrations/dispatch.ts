import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  buildWebhookRequest,
  deliveryDecision,
  failureCountAfterDelivery,
  providerRetryDelayMilliseconds,
} from "./messages";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { enqueueWebhookDelivery } from "./queue";

/**
 * Webhook delivery with bounded retries and result recording.
 *
 * Slack receives its native `text` payload. Discord receives native `content`
 * with mentions disabled, so Slack mrkdwn is never leaked into Discord.
 */

export const MAX_CONSECUTIVE_FAILURES = 20;
export const WEBHOOK_TIMEOUT_MS = 10_000;
const CLEANUP_BATCH_SIZE = 25;
const MAX_CLEANUP_DRAIN_DEPTH = 20;
const ORPHAN_GRACE_MS = 10 * 60 * 1_000;
const CLEANUP_CLAIM_LEASE_MS = 5 * 60 * 1_000;

export const deliver = internalAction({
  args: {
    webhookId: v.id("orgWebhooks"),
    text: v.string(),
    attempt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attempt = args.attempt ?? 0;
    const target = await ctx.runQuery(
      internal.features.integrations.dispatch._getDeliveryTarget,
      { webhookId: args.webhookId, generation: args.generation }
    );
    if (!target) return null;
    if (
      target.deliveryEmbargoUntil !== undefined &&
      target.deliveryEmbargoUntil > Date.now()
    ) {
      await ctx.runMutation(
        internal.features.integrations.dispatch._scheduleRetry,
        {
          webhookId: args.webhookId,
          text: args.text,
          attempt,
          generation: args.generation,
          notBefore: target.deliveryEmbargoUntil,
        }
      );
      return null;
    }

    let url: string;
    try {
      url = await ctx.runAction(internal.features.vault.vault.readSecret, {
        vaultRef: target.vaultRef,
      });
    } catch {
      url = "";
    }
    // Vault reads are external and can take seconds. Revalidate the queue
    // generation, pause/delete state, feature gate, and any newly-set embargo
    // after decryption and immediately before the outbound POST.
    const currentTarget = await ctx.runQuery(
      internal.features.integrations.dispatch._getDeliveryTarget,
      { webhookId: args.webhookId, generation: args.generation }
    );
    if (!currentTarget) return null;
    if (
      currentTarget.deliveryEmbargoUntil !== undefined &&
      currentTarget.deliveryEmbargoUntil > Date.now()
    ) {
      await ctx.runMutation(
        internal.features.integrations.dispatch._scheduleRetry,
        {
          webhookId: args.webhookId,
          text: args.text,
          attempt,
          generation: args.generation,
          notBefore: currentTarget.deliveryEmbargoUntil,
        }
      );
      return null;
    }
    const request = buildWebhookRequest({
      provider: currentTarget.type,
      url,
      text: args.text,
    });

    let status = 0; // 0 = network failure, recorded like any non-2xx
    let retryAfter: string | null = null;
    let discordRetryAfterMs: number | undefined;
    try {
      if (!url) throw new Error("Webhook credential unavailable");
      const res = await fetch(request.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: request.body,
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
        redirect: "error",
      });
      status = res.status;
      retryAfter = res.headers.get("Retry-After");
      if (status === 429 && currentTarget.type === "discord") {
        const data = (await res.json().catch(() => null)) as {
          retry_after?: unknown;
        } | null;
        if (
          data &&
          typeof data.retry_after === "number" &&
          Number.isFinite(data.retry_after)
        ) {
          // Discord documents retry_after in seconds, including fractions.
          discordRetryAfterMs = data.retry_after * 1_000;
        }
      }
    } catch {
      status = 0;
    }

    const decision = deliveryDecision({
      status,
      attempt,
      retryAfter,
      discordRetryAfterMs,
    });
    const providerRetryDelay =
      status === 429
        ? providerRetryDelayMilliseconds({
            retryAfter,
            discordRetryAfterMs,
          })
        : 0;
    if (decision.retry) {
      const notBefore =
        Date.now() + Math.max(decision.delayMs, providerRetryDelay);
      await ctx.runMutation(
        internal.features.integrations.dispatch._scheduleRetry,
        {
          webhookId: args.webhookId,
          text: args.text,
          attempt: attempt + 1,
          generation: args.generation,
          notBefore,
          setEmbargo: status === 429,
        }
      );
      return null;
    }
    if (status === 429) {
      await ctx.runMutation(
        internal.features.integrations.dispatch._setEmbargo,
        {
          webhookId: args.webhookId,
          generation: args.generation,
          notBefore: Date.now() + Math.max(1_000, providerRetryDelay),
        }
      );
    }

    await ctx.runMutation(
      internal.features.integrations.dispatch._recordDelivery,
      {
        webhookId: args.webhookId,
        status,
        generation: args.generation,
      }
    );
    return null;
  },
});

export const _getDeliveryTarget = internalQuery({
  args: {
    webhookId: v.id("orgWebhooks"),
    generation: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      vaultRef: v.string(),
      type: v.union(v.literal("slack"), v.literal("discord")),
      deliveryEmbargoUntil: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook || hook.deletedAt !== undefined || !hook.enabled) return null;
    if ((args.generation ?? 0) !== (hook.queueGeneration ?? 0)) return null;
    const gate = await checkBooleanFeature(
      ctx.db,
      hook.organizationId,
      "team_notifications"
    );
    if (!gate.allowed) return null;
    return {
      vaultRef: hook.vaultRef,
      type: hook.type,
      deliveryEmbargoUntil: hook.deliveryEmbargoUntil,
    };
  },
});

export const _scheduleRetry = internalMutation({
  args: {
    webhookId: v.id("orgWebhooks"),
    text: v.string(),
    attempt: v.number(),
    generation: v.optional(v.number()),
    notBefore: v.number(),
    setEmbargo: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (
      !hook ||
      hook.deletedAt !== undefined ||
      !hook.enabled ||
      (args.generation ?? 0) !== (hook.queueGeneration ?? 0)
    ) {
      return null;
    }
    if (args.setEmbargo && args.notBefore > (hook.deliveryEmbargoUntil ?? 0)) {
      await ctx.db.patch(args.webhookId, {
        deliveryEmbargoUntil: args.notBefore,
      });
    }
    await enqueueWebhookDelivery(ctx, {
      webhookId: args.webhookId,
      text: args.text,
      attempt: args.attempt,
      generation: args.generation,
      notBefore: args.notBefore,
    });
    return null;
  },
});

export const _setEmbargo = internalMutation({
  args: {
    webhookId: v.id("orgWebhooks"),
    generation: v.optional(v.number()),
    notBefore: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (
      !hook ||
      hook.deletedAt !== undefined ||
      !hook.enabled ||
      (args.generation ?? 0) !== (hook.queueGeneration ?? 0)
    ) {
      return null;
    }
    if (args.notBefore > (hook.deliveryEmbargoUntil ?? 0)) {
      await ctx.db.patch(args.webhookId, {
        deliveryEmbargoUntil: args.notBefore,
        nextDeliveryAt: Math.max(hook.nextDeliveryAt ?? 0, args.notBefore),
      });
    }
    return null;
  },
});

export const _recordDelivery = internalMutation({
  args: {
    webhookId: v.id("orgWebhooks"),
    status: v.number(),
    generation: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook || hook.deletedAt !== undefined) return null;
    if ((args.generation ?? 0) !== (hook.queueGeneration ?? 0)) return null;

    // Provider throttling proves the endpoint still exists. Record it for the
    // UI, but never count it toward dead-endpoint auto-disable.
    if (args.status === 429) {
      await ctx.db.patch(args.webhookId, { lastStatus: args.status });
      return null;
    }

    const ok = args.status >= 200 && args.status < 300;
    const failCount = failureCountAfterDelivery(args.status, hook.failCount);
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

export const purge = internalAction({
  args: {
    webhookId: v.id("orgWebhooks"),
    vaultRef: v.string(),
    attempt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const removed = await ctx
      .runAction(internal.features.vault.vault.deleteSecret, {
        vaultRef: args.vaultRef,
      })
      .catch(() => false);
    if (removed) {
      await ctx.runMutation(
        internal.features.integrations.dispatch._deletePurged,
        { webhookId: args.webhookId, vaultRef: args.vaultRef }
      );
      return null;
    }

    const attempt = args.attempt ?? 0;
    if (attempt + 1 < 3) {
      await ctx.scheduler.runAfter(
        2_000 * 2 ** attempt,
        internal.features.integrations.dispatch.purge,
        { ...args, attempt: attempt + 1 }
      );
    }
    return null;
  },
});

export const purgeOrphan = internalAction({
  args: {
    cleanupId: v.id("webhookVaultCleanup"),
    vaultRef: v.string(),
    attempt: v.optional(v.number()),
    claimedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claimedAt =
      args.claimedAt ??
      (await ctx.runMutation(
        internal.features.integrations.dispatch._claimOrphanPointer,
        {
          cleanupId: args.cleanupId,
          vaultRef: args.vaultRef,
        }
      ));
    if (claimedAt === null) return null;

    const removed = await ctx
      .runAction(internal.features.vault.vault.deleteSecret, {
        vaultRef: args.vaultRef,
      })
      .catch(() => false);
    if (removed) {
      await ctx.runMutation(
        internal.features.integrations.dispatch._deleteOrphanPointer,
        {
          cleanupId: args.cleanupId,
          vaultRef: args.vaultRef,
          claimedAt,
        }
      );
      return null;
    }

    const attempt = args.attempt ?? 0;
    if (attempt + 1 < 3) {
      await ctx.scheduler.runAfter(
        2_000 * 2 ** attempt,
        internal.features.integrations.dispatch.purgeOrphan,
        { ...args, attempt: attempt + 1, claimedAt }
      );
    }
    return null;
  },
});

export const _deletePurged = internalMutation({
  args: { webhookId: v.id("orgWebhooks"), vaultRef: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (
      hook &&
      hook.deletedAt !== undefined &&
      hook.vaultRef === args.vaultRef
    ) {
      await ctx.db.delete(args.webhookId);
    }
    return null;
  },
});

/**
 * Durable Vault cleanup sweep. Hourly cron invocation is the backstop for
 * exhausted immediate retries, process interruption, and failed webhook-row
 * creation after a Vault object was already created.
 */
export const cleanupVault = internalAction({
  args: { depth: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const batch = await ctx.runMutation(
      internal.features.integrations.dispatch._claimCleanupCandidates,
      {}
    );

    for (const orphan of batch.orphans) {
      const removed = await ctx
        .runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: orphan.vaultRef,
        })
        .catch(() => false);
      if (removed) {
        await ctx.runMutation(
          internal.features.integrations.dispatch._deleteOrphanPointer,
          orphan
        );
      }
    }

    for (const hook of batch.deletedHooks) {
      const removed = await ctx
        .runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: hook.vaultRef,
        })
        .catch(() => false);
      if (removed) {
        await ctx.runMutation(
          internal.features.integrations.dispatch._deletePurged,
          {
            webhookId: hook.webhookId,
            vaultRef: hook.vaultRef,
          }
        );
      }
    }

    const full =
      batch.orphans.length === CLEANUP_BATCH_SIZE ||
      batch.deletedHooks.length === CLEANUP_BATCH_SIZE;
    const depth = args.depth ?? 0;
    if (full && depth + 1 < MAX_CLEANUP_DRAIN_DEPTH) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.integrations.dispatch.cleanupVault,
        { depth: depth + 1 }
      );
    }
    return null;
  },
});

export const _claimCleanupCandidates = internalMutation({
  args: {},
  returns: v.object({
    orphans: v.array(
      v.object({
        cleanupId: v.id("webhookVaultCleanup"),
        vaultRef: v.string(),
        claimedAt: v.number(),
      })
    ),
    deletedHooks: v.array(
      v.object({
        webhookId: v.id("orgWebhooks"),
        vaultRef: v.string(),
      })
    ),
  }),
  handler: async (ctx) => {
    const orphanCutoff = Date.now() - ORPHAN_GRACE_MS;
    const staleClaimCutoff = Date.now() - CLEANUP_CLAIM_LEASE_MS;
    const [orphanRows, deletedHooks] = await Promise.all([
      ctx.db
        .query("webhookVaultCleanup")
        .withIndex("by_created_at", (q) => q.lt("createdAt", orphanCutoff))
        .take(CLEANUP_BATCH_SIZE * 4),
      ctx.db
        .query("orgWebhooks")
        .withIndex("by_deleted_at", (q) => q.gt("deletedAt", 0))
        .take(CLEANUP_BATCH_SIZE),
    ]);
    const claimable = orphanRows
      .filter(
        (row) => row.claimedAt === undefined || row.claimedAt < staleClaimCutoff
      )
      .slice(0, CLEANUP_BATCH_SIZE);
    const claimedAt = Date.now();
    for (const row of claimable) {
      await ctx.db.patch(row._id, { claimedAt });
    }
    return {
      orphans: claimable.map((row) => ({
        cleanupId: row._id,
        vaultRef: row.vaultRef,
        claimedAt,
      })),
      deletedHooks: deletedHooks.map((hook) => ({
        webhookId: hook._id,
        vaultRef: hook.vaultRef,
      })),
    };
  },
});

export const _deleteOrphanPointer = internalMutation({
  args: {
    cleanupId: v.id("webhookVaultCleanup"),
    vaultRef: v.string(),
    claimedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const pointer = await ctx.db.get(args.cleanupId);
    if (
      pointer?.vaultRef === args.vaultRef &&
      pointer.claimedAt === args.claimedAt
    ) {
      await ctx.db.delete(args.cleanupId);
    }
    return null;
  },
});

export const _claimOrphanPointer = internalMutation({
  args: {
    cleanupId: v.id("webhookVaultCleanup"),
    vaultRef: v.string(),
  },
  returns: v.union(v.null(), v.number()),
  handler: async (ctx, args) => {
    const pointer = await ctx.db.get(args.cleanupId);
    if (!pointer || pointer.vaultRef !== args.vaultRef) return null;
    const staleClaimCutoff = Date.now() - CLEANUP_CLAIM_LEASE_MS;
    if (
      pointer.claimedAt !== undefined &&
      pointer.claimedAt >= staleClaimCutoff
    ) {
      return null;
    }
    const claimedAt = Date.now();
    await ctx.db.patch(args.cleanupId, { claimedAt });
    return claimedAt;
  },
});
