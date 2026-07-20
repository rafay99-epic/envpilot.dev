import { v, ConvexError } from "convex/values";
import { mutation, query } from "../../_generated/server";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertOrgMembership, hasCapability } from "../../lib/authz";
import {
  checkBooleanFeature,
  checkNumericLimit,
  countActiveWebhooks,
} from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";
import { WEBHOOK_EVENT_GROUPS } from "./notify";

/**
 * Org notification webhooks (Slack / Discord) — CRUD surface.
 *
 * A webhook URL is a capability URL: whoever holds it can post to the
 * channel. It is stored in Convex (like the platforms themselves recommend
 * for integrations) but NEVER returned raw by any query — list responses
 * carry a masked preview only. OAuth access tokens are exchanged by the web
 * app and discarded; only the resulting webhook URL reaches this module.
 *
 * Management requires the org.manage capability (owner by default).
 * Pro-gated via team_notifications + team_notifications_limit (dual gate —
 * outbound HTTP per event is infrastructure cost).
 */

const URL_PREFIXES: Record<Doc<"orgWebhooks">["type"], string[]> = {
  slack: ["https://hooks.slack.com/services/"],
  discord: [
    "https://discord.com/api/webhooks/",
    "https://discordapp.com/api/webhooks/",
  ],
};

const TEST_TEXT =
  "✓ Connected — EnvPilot will post organization activity to this channel.";

function assertValidEventGroups(groups: string[]): void {
  if (groups.length === 0) {
    throw new ConvexError("Subscribe to at least one event group");
  }
  for (const g of groups) {
    if (!(WEBHOOK_EVENT_GROUPS as readonly string[]).includes(g)) {
      throw new ConvexError(`Unknown event group "${g}"`);
    }
  }
  if (new Set(groups).size !== groups.length) {
    throw new ConvexError("Duplicate event group");
  }
}

function assertValidUrl(type: Doc<"orgWebhooks">["type"], url: string): void {
  if (!URL_PREFIXES[type].some((p) => url.startsWith(p))) {
    throw new ConvexError(
      type === "slack"
        ? "Slack webhook URLs start with https://hooks.slack.com/services/"
        : "Discord webhook URLs start with https://discord.com/api/webhooks/"
    );
  }
}

function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}/••••${url.slice(-4)}`;
  } catch {
    return "••••";
  }
}

async function requireWebhookManager(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
): Promise<Doc<"users">> {
  const actor = await requireAuthedUser(ctx);
  const { profile } = await assertOrgMembership(ctx, actor._id, organizationId);
  if (!hasCapability(profile, "org.manage")) {
    throw new ConvexError(
      "Managing notification webhooks requires organization management permissions (owner by default)."
    );
  }
  return actor;
}

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    type: v.union(v.literal("slack"), v.literal("discord")),
    source: v.union(v.literal("oauth"), v.literal("manual")),
    url: v.string(),
    channel: v.optional(v.string()),
    eventGroups: v.array(v.string()),
  },
  returns: v.id("orgWebhooks"),
  handler: async (ctx, args) => {
    const actor = await requireWebhookManager(ctx, args.organizationId);

    const name = args.name.trim();
    if (name.length === 0 || name.length > 100) {
      throw new ConvexError("Webhook name must be 1-100 characters");
    }
    assertValidUrl(args.type, args.url);
    assertValidEventGroups(args.eventGroups);

    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "team_notifications"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        "Slack & Discord notifications are available on the Pro plan. Upgrade to connect channels."
      );
    }
    const count = await countActiveWebhooks(ctx.db, args.organizationId);
    const limit = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "team_notifications_limit",
      count
    );
    if (!limit.allowed) {
      throw new ConvexError(
        `Webhook limit reached (${limit.current}/${limit.limit}). Remove one to add another.`
      );
    }

    const now = Date.now();
    const webhookId = await ctx.db.insert("orgWebhooks", {
      organizationId: args.organizationId,
      name,
      type: args.type,
      source: args.source,
      url: args.url,
      channel: args.channel,
      eventGroups: args.eventGroups,
      enabled: true,
      failCount: 0,
      createdBy: actor._id,
      createdAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "integration.webhook_created",
      details: {
        webhookId,
        name,
        type: args.type,
        source: args.source,
        channel: args.channel,
        eventGroups: args.eventGroups,
      },
    });

    // Immediate proof-of-life: the test message lands in the channel while
    // the user is still on the settings page.
    await ctx.scheduler.runAfter(
      0,
      internal.features.integrations.dispatch.deliver,
      { webhookId, url: args.url, type: args.type, text: TEST_TEXT }
    );

    return webhookId;
  },
});

export const update = mutation({
  args: {
    webhookId: v.id("orgWebhooks"),
    name: v.optional(v.string()),
    eventGroups: v.optional(v.array(v.string())),
    enabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) throw new ConvexError("Webhook not found");
    const actor = await requireWebhookManager(ctx, hook.organizationId);

    const patch: Partial<Doc<"orgWebhooks">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length === 0 || name.length > 100) {
        throw new ConvexError("Webhook name must be 1-100 characters");
      }
      patch.name = name;
    }
    if (args.eventGroups !== undefined) {
      assertValidEventGroups(args.eventGroups);
      patch.eventGroups = args.eventGroups;
    }
    if (args.enabled !== undefined) {
      patch.enabled = args.enabled;
      // Re-enabling clears the strike counter so the endpoint gets a fresh 20
      if (args.enabled && !hook.enabled) patch.failCount = 0;
    }
    if (Object.keys(patch).length === 0) return null;

    await ctx.db.patch(args.webhookId, patch);
    await createAuditLog(ctx, {
      organizationId: hook.organizationId,
      userId: actor._id,
      action: "integration.webhook_updated",
      details: { webhookId: args.webhookId, name: hook.name, ...patch },
    });
    return null;
  },
});

export const remove = mutation({
  args: { webhookId: v.id("orgWebhooks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) throw new ConvexError("Webhook not found");
    const actor = await requireWebhookManager(ctx, hook.organizationId);

    await ctx.db.delete(args.webhookId);
    await createAuditLog(ctx, {
      organizationId: hook.organizationId,
      userId: actor._id,
      action: "integration.webhook_deleted",
      details: {
        webhookId: args.webhookId,
        name: hook.name,
        type: hook.type,
        channel: hook.channel,
      },
    });
    return null;
  },
});

export const sendTest = mutation({
  args: { webhookId: v.id("orgWebhooks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook) throw new ConvexError("Webhook not found");
    await requireWebhookManager(ctx, hook.organizationId);

    await ctx.scheduler.runAfter(
      0,
      internal.features.integrations.dispatch.deliver,
      { webhookId: hook._id, url: hook.url, type: hook.type, text: TEST_TEXT }
    );
    return null;
  },
});

export const listForOrganization = query({
  args: { organizationId: v.id("organizations") },
  returns: v.array(
    v.object({
      _id: v.id("orgWebhooks"),
      name: v.string(),
      type: v.union(v.literal("slack"), v.literal("discord")),
      source: v.union(v.literal("oauth"), v.literal("manual")),
      channel: v.union(v.string(), v.null()),
      urlPreview: v.string(),
      eventGroups: v.array(v.string()),
      enabled: v.boolean(),
      failCount: v.number(),
      lastStatus: v.union(v.number(), v.null()),
      lastSentAt: v.union(v.number(), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { profile } = await assertOrgMembership(
      ctx,
      actor._id,
      args.organizationId
    );
    // Non-managers see an empty list rather than an error — same pattern as
    // the API-keys list omitting unmanageable keys.
    if (!hasCapability(profile, "org.manage")) return [];

    const hooks = await ctx.db
      .query("orgWebhooks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    return hooks.map((h) => ({
      _id: h._id,
      name: h.name,
      type: h.type,
      source: h.source,
      channel: h.channel ?? null,
      urlPreview: maskUrl(h.url),
      eventGroups: h.eventGroups,
      enabled: h.enabled,
      failCount: h.failCount,
      lastStatus: h.lastStatus ?? null,
      lastSentAt: h.lastSentAt ?? null,
      createdAt: h.createdAt,
    }));
  },
});
