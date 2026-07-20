import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { AuditLogInput } from "../../lib/audit";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * Notification webhook fanout (Slack / Discord).
 *
 * Called from createAuditLog — the single choke point every notifiable event
 * already routes through — so new audit actions get webhook coverage by
 * adding one map entry, never per-mutation wiring.
 *
 * Payloads carry key names, environments and actor names — NEVER secret
 * values. Delivery is fire-and-forget via the scheduler; a webhook outage
 * can never fail the audited mutation.
 */

export const WEBHOOK_EVENT_GROUPS = [
  "variables",
  "requests",
  "members",
  "security",
] as const;
export type WebhookEventGroup = (typeof WEBHOOK_EVENT_GROUPS)[number];

// Audit action → subscribable event group. Actions absent here never notify.
const NOTIFY_GROUP: Record<string, WebhookEventGroup> = {
  "variable.created": "variables",
  "variable.updated": "variables",
  "variable.deleted": "variables",
  "variable.exported": "variables",
  "variable.requested": "requests",
  "variable.request_approved": "requests",
  "variable.request_rejected": "requests",
  "invitation.sent": "members",
  "org.member_removed": "members",
  "permission.granted": "members",
  "permission.revoked": "members",
  "security.access_denied": "security",
  "security.unauthorized_attempt": "security",
  "access.token_created": "security",
  "access.token_revoked": "security",
};

const ACTION_TITLES: Record<string, { glyph: string; title: string }> = {
  "variable.created": { glyph: "+", title: "Variable created" },
  "variable.updated": { glyph: "↻", title: "Variable updated" },
  "variable.deleted": { glyph: "✗", title: "Variable deleted" },
  "variable.exported": { glyph: "↓", title: "Variables exported" },
  "variable.requested": { glyph: "±", title: "Access requested" },
  "variable.request_approved": { glyph: "✓", title: "Request approved" },
  "variable.request_rejected": { glyph: "✗", title: "Request rejected" },
  "invitation.sent": { glyph: "+", title: "Invitation sent" },
  "org.member_removed": { glyph: "−", title: "Member removed" },
  "permission.granted": { glyph: "✓", title: "Permission granted" },
  "permission.revoked": { glyph: "✗", title: "Permission revoked" },
  "security.access_denied": { glyph: "!", title: "Access denied" },
  "security.unauthorized_attempt": {
    glyph: "!",
    title: "Unauthorized attempt",
  },
  "access.token_created": { glyph: "+", title: "Access token created" },
  "access.token_revoked": { glyph: "✗", title: "Access token revoked" },
};

// Slack mrkdwn requires these three escaped in message text
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildNotificationText(input: {
  action: string;
  details?: Record<string, unknown>;
  actorName: string;
  projectName?: string;
  link: string;
}): string {
  const meta = ACTION_TITLES[input.action] ?? {
    glyph: "•",
    title: input.action,
  };
  const key =
    typeof input.details?.key === "string" ? input.details.key : undefined;
  const envs = Array.isArray(input.details?.environments)
    ? input.details.environments.filter(
        (e): e is string => typeof e === "string"
      )
    : [];

  let headline = `${meta.glyph} ${meta.title}`;
  if (key) headline += `: *${esc(key)}*`;
  if (envs.length > 0) headline += ` (${esc(envs.join(", "))})`;

  const context = [
    input.projectName ? esc(input.projectName) : undefined,
    `by ${esc(input.actorName)}`,
    `<${input.link}|View in EnvPilot>`,
  ]
    .filter(Boolean)
    .join(" · ");

  return `${headline}\n${context}`;
}

/**
 * Fan a notifiable audit event out to the org's subscribed webhooks.
 * Swallows every error — audit logging sits on critical write paths and a
 * notification problem must never break them.
 */
export async function maybeNotifyWebhooks(
  ctx: MutationCtx,
  input: AuditLogInput
): Promise<void> {
  try {
    const group = NOTIFY_GROUP[input.action];
    if (!group) return;

    const hooks = await ctx.db
      .query("orgWebhooks")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", input.organizationId)
      )
      .collect();
    const targets = hooks.filter(
      (h) => h.enabled && h.eventGroups.includes(group)
    );
    if (targets.length === 0) return;

    // Tier re-check at send time — a downgraded org stops notifying without
    // needing its rows cleaned up.
    const gate = await checkBooleanFeature(
      ctx.db,
      input.organizationId,
      "team_notifications"
    );
    if (!gate.allowed) return;

    const [actor, project, org] = await Promise.all([
      ctx.db.get(input.userId),
      input.projectId ? ctx.db.get(input.projectId) : Promise.resolve(null),
      ctx.db.get(input.organizationId),
    ]);
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://www.envpilot.dev";
    const link = org ? `${appUrl}/organizations/${org.slug}` : appUrl;

    const text = buildNotificationText({
      action: input.action,
      details: input.details,
      actorName: actor?.name ?? actor?.email ?? "someone",
      projectName: project?.name,
      link,
    });

    for (const hook of targets) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.integrations.dispatch.deliver,
        { webhookId: hook._id, url: hook.url, type: hook.type, text }
      );
    }
  } catch (err) {
    console.error("Webhook notification fanout failed", err);
  }
}
