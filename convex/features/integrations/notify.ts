import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { buildNotificationText, matchesProjectScope } from "./messages";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { enqueueWebhookDelivery } from "./queue";

export const WEBHOOK_EVENT_GROUPS = [
  "variables",
  "requests",
  "members",
  "security",
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

    // The tier limit is 10. The bounded read also protects deployments with
    // stale or manually inserted rows without making fanout unbounded.
    const hooks = await ctx.db
      .query("orgWebhooks")
      .withIndex("by_organization_and_deleted_at", (q) =>
        q.eq("organizationId", audit.organizationId).eq("deletedAt", undefined)
      )
      .take(11);
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
    const link = organization
      ? `${appUrl.replace(/\/+$/, "")}/organizations/${organization.slug}`
      : appUrl;
    const details = parseDetails(audit.details);

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
