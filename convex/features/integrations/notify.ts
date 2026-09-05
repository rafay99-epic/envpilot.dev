import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  checkBooleanFeature,
  checkNumericLimit,
} from "../featureRegistry/gates";
import { buildNotificationText, matchesProjectScope } from "./messages";
import { reviewPath } from "./links";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { enqueueWebhookDelivery } from "./queue";
import { MAX_WEBHOOKS_PER_ORGANIZATION } from "../../lib/integrationLimits";

export const WEBHOOK_EVENT_GROUPS = [
  "variables",
  "requests",
  "members",
  "security",
  "docs",
] as const;
export type WebhookEventGroup = (typeof WEBHOOK_EVENT_GROUPS)[number];

// Only actions with proven production writers belong here. An action absent
// from this map is intentionally silent.
const NOTIFY_GROUP: Record<string, WebhookEventGroup> = {
  "variable.created": "variables",
  "variable.updated": "variables",
  "variable.deleted": "variables",
  "variable.exported": "variables",
  "variable.rotated": "variables",
  "variable.restored": "variables",
  "variable.rollback": "variables",
  "variable.requested": "requests",
  "variable.request_approved": "requests",
  "variable.request_rejected": "requests",
  "change.requested": "requests",
  "change.applied": "requests",
  "change.rejected": "requests",
  "change.reminder_sent": "requests",
  "change.overridden": "security",
  "protection.enabled": "security",
  "protection.disabled": "security",
  "invitation.sent": "members",
  "org.member_removed": "members",
  "account.permission_granted": "members",
  "account.permission_revoked": "members",
  "account.permission_updated": "members",
  "api.key_created": "security",
  "api.key_revoked": "security",
  "api.request_denied": "security",
  "access.token_revoked": "security",
  "access.extension_unlinked": "security",
  // Only the publish. Drafts and edits are working state — notifying on
  // them would be noise, and a draft is precisely the thing nobody else is
  // supposed to know about yet.
  "doc.published": "docs",
  // Sharing is a distribution event the team should see, especially the
  // external kind. Views are audit-only: a channel message per read is noise.
  "doc.shared": "docs",
};

export function isNotifiableAction(action: string): boolean {
  return NOTIFY_GROUP[action] !== undefined;
}

/**
 * Keep the audit hot path cheap: after the audit row is committed, one
 * scheduled mutation performs every gate/read/fanout operation.
 */
export async function scheduleWebhookNotification(
  ctx: MutationCtx,
  auditLogId: Id<"auditLogs">,
  action: string
): Promise<void> {
  if (!isNotifiableAction(action)) return;
  try {
    await ctx.scheduler.runAfter(
      0,
      internal.features.integrations.notify.prepare,
      { auditLogId }
    );
  } catch (error) {
    console.error("Webhook notification scheduling failed", error);
    await ctx.db.insert("webhookNotificationFallbacks", {
      auditLogId,
      createdAt: Date.now(),
    });
  }
}

function parseDetails(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export const recoverPendingNotifications = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const pending = await ctx.db
      .query("webhookNotificationFallbacks")
      .withIndex("by_created_at")
      .take(50);
    for (const item of pending) {
      const audit = await ctx.db.get(item.auditLogId);
      if (!audit || !isNotifiableAction(audit.action)) {
        await ctx.db.delete(item._id);
        continue;
      }
      try {
        await ctx.scheduler.runAfter(
          0,
          internal.features.integrations.notify.prepare,
          { auditLogId: item.auditLogId }
        );
        await ctx.db.delete(item._id);
      } catch (error) {
        console.error("Webhook notification recovery scheduling failed", error);
      }
    }
    return null;
  },
});

export const prepare = internalMutation({
  args: { auditLogId: v.id("auditLogs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const audit = await ctx.db.get(args.auditLogId);
    if (!audit) return null;
    const group = NOTIFY_GROUP[audit.action];
    if (!group) return null;
    const gate = await checkBooleanFeature(
      ctx.db,
      audit.organizationId,
      "team_notifications"
    );
    if (!gate.allowed) return null;

    const plan = await checkNumericLimit(
      ctx.db,
      audit.organizationId,
      "team_notifications_limit",
      0
    );
    const fanoutLimit = Math.min(
      MAX_WEBHOOKS_PER_ORGANIZATION,
      plan.limit === null
        ? MAX_WEBHOOKS_PER_ORGANIZATION
        : Math.max(0, Math.floor(plan.limit))
    );
    if (fanoutLimit === 0) return null;

    // Read at most the resolved plan allowance. Legacy over-cap data therefore
    // cannot produce an extra (11th on the Pro plan) outbound delivery.
    const hooks = await ctx.db
      .query("orgWebhooks")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", audit.organizationId).eq("deletedAt", undefined)
      )
      .take(fanoutLimit);
    const targets = hooks.filter(
      (hook) =>
        hook.enabled &&
        hook.eventGroups.includes(group) &&
        matchesProjectScope(hook.projectIds, audit.projectId)
    );
    if (targets.length === 0) return null;
    if (audit.action === "api.request_denied") {
      try {
        await rateLimiter.limit(ctx, "webhookSecurityNotification", {
          key: audit.organizationId,
          throws: true,
        });
      } catch (error) {
        if (isRateLimitError(error)) return null;
        throw error;
      }
    }

    const [actor, project, organization] = await Promise.all([
      ctx.db.get(audit.userId),
      audit.projectId ? ctx.db.get(audit.projectId) : Promise.resolve(null),
      ctx.db.get(audit.organizationId),
    ]);
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://www.envpilot.dev";
    const details = parseDetails(audit.details);
    const link = `${appUrl.replace(/\/+$/, "")}${reviewPath(audit.action, details, organization?.slug)}`;

    for (const hook of targets) {
      try {
        const text = buildNotificationText({
          provider: hook.type,
          action: audit.action,
          details,
          actorName: actor?.name ?? actor?.email ?? "someone",
          projectName: project?.name,
          link,
        });
        await enqueueWebhookDelivery(ctx, {
          webhookId: hook._id,
          text,
        });
      } catch (error) {
        // One malformed/deleted target must never suppress its siblings.
        console.error(`Webhook fanout failed for ${hook._id}`, error);
      }
    }
    return null;
  },
});
