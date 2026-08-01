import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  mutation,
  query,
} from "../../_generated/server";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertOrgMembership, hasCapability } from "../../lib/authz";
import {
  checkBooleanFeature,
  checkNumericLimit,
  countConfiguredWebhooks,
} from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { WEBHOOK_EVENT_GROUPS } from "./notify";
import { enqueueWebhookDelivery } from "./queue";

const eventGroupValidator = v.union(
  v.literal("variables"),
  v.literal("requests"),
  v.literal("members"),
  v.literal("security")
);

type WebhookType = Doc<"orgWebhooks">["type"];
type EventGroup = Doc<"orgWebhooks">["eventGroups"][number];

const TEST_TEXT =
  "✓ Connected — EnvPilot can post organization activity to this channel.";

function validateName(value: string): string {
  const name = value.trim();
  if (name.length === 0 || name.length > 100) {
    throw new ConvexError("Webhook name must be 1-100 characters");
  }
  return name;
}

function validateEventGroups(groups: EventGroup[]): void {
  if (groups.length === 0) {
    throw new ConvexError("Subscribe to at least one event group");
  }
  for (const group of groups) {
    if (!(WEBHOOK_EVENT_GROUPS as readonly string[]).includes(group)) {
      throw new ConvexError(`Unknown event group "${group}"`);
    }
  }
  if (new Set(groups).size !== groups.length) {
    throw new ConvexError("Duplicate event group");
  }
}

function validateUrl(type: WebhookType, rawUrl: string): URL {
  if (rawUrl.length > 2_048) {
    throw new ConvexError("Webhook URL is too long");
  }
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ConvexError("Enter a valid webhook URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ConvexError(
      "Webhook URLs must be clean HTTPS URLs without credentials, queries, or fragments"
    );
  }
  const slack =
    type === "slack" &&
    url.hostname === "hooks.slack.com" &&
    /^\/services\/[^/]+\/[^/]+\/[^/]+\/?$/.test(url.pathname);
  const discord =
    type === "discord" &&
    (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
    /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname);
  if (!slack && !discord) {
    throw new ConvexError(
      type === "slack"
        ? "Enter a Slack Incoming Webhook URL from hooks.slack.com"
        : "Enter a Discord webhook URL from discord.com"
    );
  }
  url.hash = "";
  return url;
}

function maskUrl(url: URL): string {
  const raw = url.toString().replace(/\/+$/, "");
  return `${url.host}/••••${raw.slice(-4)}`;
}

async function requireWebhookManager(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">
): Promise<Doc<"users">> {
  const actor = await requireAuthedUser(ctx);
  try {
    const { profile } = await assertOrgMembership(
      ctx,
      actor._id,
      organizationId
    );
    if (!hasCapability(profile, "org.manage")) {
      throw new ConvexError(
        "Managing notification webhooks requires organization management permissions."
      );
    }
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError(
      "You do not have access to manage integrations for this organization."
    );
  }
  return actor;
}

async function validateProjectScope(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">,
  projectIds: Id<"projects">[] | undefined
): Promise<void> {
  if (!projectIds) return;
  if (projectIds.length === 0) {
    throw new ConvexError(
      "Select at least one project or choose all projects."
    );
  }
  if (projectIds.length > 100) {
    throw new ConvexError("Select up to 100 projects, or choose all projects.");
  }
  if (new Set(projectIds).size !== projectIds.length) {
    throw new ConvexError("Each selected project must be unique.");
  }
  const projects = await Promise.all(projectIds.map((id) => ctx.db.get(id)));
  for (const project of projects) {
    if (
      !project ||
      project.deletedAt !== undefined ||
      project.organizationId !== organizationId
    ) {
      throw new ConvexError(
        "Select active projects from this organization only."
      );
    }
  }
}

async function requireFeatureCapacity(
  ctx: MutationCtx | QueryCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const gate = await checkBooleanFeature(
    ctx.db,
    organizationId,
    "team_notifications"
  );
  if (!gate.allowed) {
    throw new ConvexError(
      "Slack & Discord notifications are available on the Pro plan."
    );
  }
  const count = await countConfiguredWebhooks(ctx.db, organizationId);
  const limit = await checkNumericLimit(
    ctx.db,
    organizationId,
    "team_notifications_limit",
    count
  );
  if (!limit.allowed) {
    throw new ConvexError(
      `Webhook limit reached (${limit.current}/${limit.limit}). Remove one to add another.`
    );
  }
}

async function enforceWebhookTestRateLimit(
  ctx: MutationCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  try {
    await rateLimiter.limit(ctx, "webhookTest", {
      key: organizationId,
      throws: true,
    });
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new ConvexError(
        "Too many test messages. Wait a moment and try again."
      );
    }
    throw error;
  }
}

/**
 * OAuth preflight. It fails before provider consent unless the caller can
 * manage this org and the feature has capacity, and derives the redirect slug
 * from the authorized organization instead of trusting a query parameter.
 */
export const getConnectEligibility = query({
  args: {
    organizationId: v.id("organizations"),
    projectIds: v.optional(v.array(v.id("projects"))),
  },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) => {
    await requireWebhookManager(ctx, args.organizationId);
    await requireFeatureCapacity(ctx, args.organizationId);
    await validateProjectScope(ctx, args.organizationId, args.projectIds);
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) throw new ConvexError("Organization not found");
    return { slug: organization.slug };
  },
});

/**
 * Encrypt the webhook capability URL in WorkOS Vault before storing metadata.
 * The database and every client query only ever see an opaque Vault reference.
 */
export const create = action({
  args: {
    organizationId: v.id("organizations"),
    name: v.string(),
    type: v.union(v.literal("slack"), v.literal("discord")),
    source: v.union(v.literal("oauth"), v.literal("manual")),
    url: v.string(),
    channel: v.optional(v.string()),
    projectIds: v.optional(v.array(v.id("projects"))),
    eventGroups: v.array(eventGroupValidator),
  },
  returns: v.id("orgWebhooks"),
  handler: async (ctx, args): Promise<Id<"orgWebhooks">> => {
    const name = validateName(args.name);
    validateEventGroups(args.eventGroups);
    const url = validateUrl(args.type, args.url);

    await ctx.runQuery(
      api.features.integrations.webhooks.getConnectEligibility,
      { organizationId: args.organizationId, projectIds: args.projectIds }
    );

    let vault: { id: string };
    try {
      vault = await ctx.runAction(internal.features.vault.vault.createSecret, {
        name: `${args.type}-notification-webhook`,
        value: url.toString(),
        organizationId: args.organizationId,
        projectId: args.organizationId,
        environment: "integrations",
      });
    } catch (error) {
      console.error("Webhook Vault create failed", error);
      throw new ConvexError(
        "Could not securely store the webhook URL. Try again."
      );
    }

    let cleanupId: Id<"webhookVaultCleanup">;
    try {
      cleanupId = await ctx.runMutation(
        internal.features.integrations.webhooks._trackVaultCleanup,
        { vaultRef: vault.id }
      );
    } catch {
      // The database could not retain a recovery pointer. Make several direct
      // deletion attempts before returning; no capability URL is logged.
      let removed = false;
      for (let attempt = 0; attempt < 3 && !removed; attempt++) {
        removed = await ctx
          .runAction(internal.features.vault.vault.deleteSecret, {
            vaultRef: vault.id,
          })
          .catch(() => false);
      }
      throw new ConvexError(
        "Could not finish secure webhook setup. Try again."
      );
    }

    try {
      return await ctx.runMutation(
        internal.features.integrations.webhooks._store,
        {
          cleanupId,
          organizationId: args.organizationId,
          name,
          type: args.type,
          source: args.source,
          vaultRef: vault.id,
          urlPreview: maskUrl(url),
          channel: args.channel,
          projectIds: args.projectIds,
          eventGroups: args.eventGroups,
        }
      );
    } catch (error) {
      await ctx.scheduler
        .runAfter(0, internal.features.integrations.dispatch.purgeOrphan, {
          cleanupId,
          vaultRef: vault.id,
        })
        .catch(() => {});
      throw error;
    }
  },
});

export const _trackVaultCleanup = internalMutation({
  args: { vaultRef: v.string() },
  returns: v.id("webhookVaultCleanup"),
  handler: async (ctx, args) =>
    await ctx.db.insert("webhookVaultCleanup", {
      vaultRef: args.vaultRef,
      createdAt: Date.now(),
    }),
});

export const _store = internalMutation({
  args: {
    cleanupId: v.id("webhookVaultCleanup"),
    organizationId: v.id("organizations"),
    name: v.string(),
    type: v.union(v.literal("slack"), v.literal("discord")),
    source: v.union(v.literal("oauth"), v.literal("manual")),
    vaultRef: v.string(),
    urlPreview: v.string(),
    channel: v.optional(v.string()),
    projectIds: v.optional(v.array(v.id("projects"))),
    eventGroups: v.array(eventGroupValidator),
  },
  returns: v.id("orgWebhooks"),
  handler: async (ctx, args) => {
    const cleanup = await ctx.db.get(args.cleanupId);
    if (
      !cleanup ||
      cleanup.vaultRef !== args.vaultRef ||
      cleanup.claimedAt !== undefined
    ) {
      throw new Error("Webhook Vault recovery pointer is missing");
    }
    const actor = await requireWebhookManager(ctx, args.organizationId);
    await requireFeatureCapacity(ctx, args.organizationId);
    await validateProjectScope(ctx, args.organizationId, args.projectIds);
    await enforceWebhookTestRateLimit(ctx, args.organizationId);

    const webhookId = await ctx.db.insert("orgWebhooks", {
      organizationId: args.organizationId,
      name: validateName(args.name),
      type: args.type,
      source: args.source,
      vaultRef: args.vaultRef,
      urlPreview: args.urlPreview,
      channel: args.channel,
      projectIds: args.projectIds,
      eventGroups: args.eventGroups,
      enabled: true,
      failCount: 0,
      createdBy: actor._id,
      createdAt: Date.now(),
    });
    // Same transaction as the live row insert: a committed webhook can never
    // retain an orphan-cleanup pointer that might later delete its credential.
    await ctx.db.delete(args.cleanupId);

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: actor._id,
      action: "integration.webhook_created",
      details: {
        webhookId,
        name: args.name,
        type: args.type,
        source: args.source,
        channel: args.channel,
        projectIds: args.projectIds,
        eventGroups: args.eventGroups,
      },
    });
    await enqueueWebhookDelivery(ctx, { webhookId, text: TEST_TEXT });
    return webhookId;
  },
});

export const update = mutation({
  args: {
    webhookId: v.id("orgWebhooks"),
    name: v.optional(v.string()),
    eventGroups: v.optional(v.array(eventGroupValidator)),
    projectIds: v.optional(v.union(v.array(v.id("projects")), v.null())),
    enabled: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook || hook.deletedAt !== undefined) {
      throw new ConvexError("Webhook not found");
    }
    const actor = await requireWebhookManager(ctx, hook.organizationId);

    const patch: Partial<Doc<"orgWebhooks">> = {};
    if (args.name !== undefined) patch.name = validateName(args.name);
    if (args.eventGroups !== undefined) {
      validateEventGroups(args.eventGroups);
      patch.eventGroups = args.eventGroups;
    }
    if (args.projectIds !== undefined) {
      const projectIds = args.projectIds ?? undefined;
      await validateProjectScope(ctx, hook.organizationId, projectIds);
      patch.projectIds = projectIds;
    }
    if (args.enabled !== undefined) {
      const gate = await checkBooleanFeature(
        ctx.db,
        hook.organizationId,
        "team_notifications"
      );
      if (args.enabled && !gate.allowed) {
        throw new ConvexError(
          "Slack & Discord notifications are available on the Pro plan."
        );
      }
      patch.enabled = args.enabled;
      if (args.enabled && !hook.enabled) patch.failCount = 0;
    }
    const invalidatesQueue =
      args.eventGroups !== undefined ||
      args.projectIds !== undefined ||
      (args.enabled !== undefined && args.enabled !== hook.enabled);
    if (invalidatesQueue) {
      patch.queueGeneration = (hook.queueGeneration ?? 0) + 1;
      patch.nextDeliveryAt = undefined;
      patch.deliveryEmbargoUntil = undefined;
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
    if (!hook || hook.deletedAt !== undefined) {
      throw new ConvexError("Webhook not found");
    }
    const actor = await requireWebhookManager(ctx, hook.organizationId);

    await ctx.db.patch(args.webhookId, {
      enabled: false,
      deletedAt: Date.now(),
      queueGeneration: (hook.queueGeneration ?? 0) + 1,
      nextDeliveryAt: undefined,
      deliveryEmbargoUntil: undefined,
    });
    await createAuditLog(ctx, {
      organizationId: hook.organizationId,
      userId: actor._id,
      action: "integration.webhook_deleted",
      details: {
        webhookId: args.webhookId,
        name: hook.name,
        type: hook.type,
        channel: hook.channel,
        projectIds: hook.projectIds,
      },
    });
    await ctx.scheduler.runAfter(
      0,
      internal.features.integrations.dispatch.purge,
      { webhookId: hook._id, vaultRef: hook.vaultRef }
    );
    return null;
  },
});

export const sendTest = mutation({
  args: { webhookId: v.id("orgWebhooks") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hook = await ctx.db.get(args.webhookId);
    if (!hook || hook.deletedAt !== undefined) {
      throw new ConvexError("Webhook not found");
    }
    await requireWebhookManager(ctx, hook.organizationId);
    const gate = await checkBooleanFeature(
      ctx.db,
      hook.organizationId,
      "team_notifications"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        "Slack & Discord notifications are available on the Pro plan."
      );
    }
    if (!hook.enabled) {
      throw new ConvexError("Resume this webhook before sending a test");
    }
    await enforceWebhookTestRateLimit(ctx, hook.organizationId);
    await enqueueWebhookDelivery(ctx, {
      webhookId: hook._id,
      text: TEST_TEXT,
    });
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
      projectIds: v.union(v.array(v.id("projects")), v.null()),
      urlPreview: v.string(),
      eventGroups: v.array(eventGroupValidator),
      enabled: v.boolean(),
      failCount: v.number(),
      lastStatus: v.union(v.number(), v.null()),
      lastSentAt: v.union(v.number(), v.null()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireWebhookManager(ctx, args.organizationId);

    const hooks = await ctx.db
      .query("orgWebhooks")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", args.organizationId).eq("deletedAt", undefined)
      )
      .take(11);

    return hooks.map((hook) => ({
      _id: hook._id,
      name: hook.name,
      type: hook.type,
      source: hook.source,
      channel: hook.channel ?? null,
      projectIds: hook.projectIds ?? null,
      urlPreview: hook.urlPreview,
      eventGroups: hook.eventGroups,
      enabled: hook.enabled,
      failCount: hook.failCount,
      lastStatus: hook.lastStatus ?? null,
      lastSentAt: hook.lastSentAt ?? null,
      createdAt: hook.createdAt,
    }));
  },
});
