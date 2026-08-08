export type WebhookProvider = "slack" | "discord";

export const MAX_DELIVERY_ATTEMPTS = 3;
export const MAX_RETRY_DELAY_MS = 60_000;
const MAX_DISCORD_CONTENT_LENGTH = 1_900;

/** Organization-wide destinations match every event; scoped ones match only
 * audit events that carry the exact selected project. */
export function matchesProjectScope(
  webhookProjectIds: readonly string[] | null | undefined,
  eventProjectId: string | null | undefined
): boolean {
  return (
    !webhookProjectIds ||
    (eventProjectId !== undefined &&
      eventProjectId !== null &&
      webhookProjectIds.includes(eventProjectId))
  );
}

const ACTION_TITLES: Record<string, { glyph: string; title: string }> = {
  "variable.created": { glyph: "+", title: "Variable created" },
  "variable.updated": { glyph: "↻", title: "Variable updated" },
  "variable.deleted": { glyph: "✗", title: "Variable deleted" },
  "variable.exported": { glyph: "↓", title: "Variables exported" },
  "variable.rotated": { glyph: "↻", title: "Variable rotated" },
  "variable.restored": { glyph: "↥", title: "Variable restored" },
  "variable.rollback": { glyph: "↶", title: "Variable rolled back" },
  "variable.requested": { glyph: "±", title: "Access requested" },
  "variable.request_approved": { glyph: "✓", title: "Request approved" },
  "variable.request_rejected": { glyph: "✗", title: "Request rejected" },
  "invitation.sent": { glyph: "+", title: "Invitation sent" },
  "org.member_removed": { glyph: "−", title: "Member removed" },
  "account.permission_granted": {
    glyph: "✓",
    title: "Account permission granted",
  },
  "account.permission_revoked": {
    glyph: "✗",
    title: "Account permission revoked",
  },
  "account.permission_updated": {
    glyph: "↻",
    title: "Account permission updated",
  },
  "api.key_created": { glyph: "+", title: "API key created" },
  "api.key_revoked": { glyph: "✗", title: "API key revoked" },
  "api.request_denied": { glyph: "!", title: "API request denied" },
  "access.token_revoked": { glyph: "✗", title: "Device session revoked" },
  "access.extension_unlinked": {
    glyph: "✗",
    title: "Extension session revoked",
  },
  "doc.published": { glyph: "✓", title: "Documentation published" },
};

function escapeSlack(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeDiscord(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|>~])/g, "\\$1");
}

const LINK_TARGET_ESCAPES: Record<string, string> = {
  "\\": "%5C",
  "[": "%5B",
  "]": "%5D",
  "(": "%28",
  ")": "%29",
  "<": "%3C",
  ">": "%3E",
  "|": "%7C",
};

/** Keep link targets inside Slack/Discord's link delimiters. Only absolute
 * HTTP(S) application links are rendered; malformed or active-content URLs
 * are omitted instead of being emitted as clickable Markdown. */
function safeLinkTarget(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    return url.href.replace(
      /[\\[\]()<>|]/g,
      (character) => LINK_TARGET_ESCAPES[character] ?? character
    );
  } catch {
    return undefined;
  }
}

function firstString(
  details: Record<string, unknown> | undefined,
  keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function environments(details: Record<string, unknown> | undefined): string[] {
  for (const key of [
    "environments",
    "approvedEnvironments",
    "requestedEnvironments",
  ]) {
    const value = details?.[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  const environment = details?.environment;
  return typeof environment === "string" && environment.length > 0
    ? [environment]
    : [];
}

function stringList(
  details: Record<string, unknown> | undefined,
  key: string
): string[] {
  const value = details?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function subject(
  action: string,
  details: Record<string, unknown> | undefined
): string | undefined {
  if (action.startsWith("variable.")) {
    const key = firstString(details, ["key", "variableKey"]);
    if (key) return key;
    const deletedKeys = stringList(details, "deletedKeys");
    if (deletedKeys.length > 0) {
      const visible = deletedKeys.slice(0, 3).join(", ");
      return deletedKeys.length > 3
        ? `${visible} +${deletedKeys.length - 3} more`
        : visible;
    }
  }
  if (action === "invitation.sent") {
    const email = firstString(details, ["email"]);
    const role = firstString(details, ["role"]);
    return email && role ? `${email} (${role})` : (email ?? role);
  }
  if (action === "org.member_removed") {
    return firstString(details, ["removedUserEmail", "removedUserId"]);
  }
  if (action.startsWith("account.permission_")) {
    const account = firstString(details, ["accountName"]);
    const target = firstString(details, [
      "grantedToEmail",
      "revokedFromEmail",
      "targetUserEmail",
    ]);
    return account && target ? `${account} → ${target}` : (account ?? target);
  }
  if (
    action === "api.key_created" ||
    action === "api.key_revoked" ||
    action === "api.request_denied"
  ) {
    return firstString(details, ["name", "keyName"]);
  }
  if (
    action === "access.token_revoked" ||
    action === "access.extension_unlinked"
  ) {
    return firstString(details, ["deviceName", "type"]);
  }
  if (action === "doc.published") {
    const title = firstString(details, ["title"]);
    const moduleName = firstString(details, ["module"]);
    return title && moduleName ? `${moduleName} → ${title}` : title;
  }
  return undefined;
}

export function buildNotificationText(input: {
  provider: WebhookProvider;
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
  const subjectText = subject(input.action, input.details);
  const envs = environments(input.details);
  const escape = input.provider === "slack" ? escapeSlack : escapeDiscord;
  const bold = (value: string) =>
    input.provider === "slack" ? `*${value}*` : `**${value}**`;

  let headline = `${meta.glyph} ${meta.title}`;
  if (subjectText) headline += `: ${bold(escape(subjectText))}`;
  if (envs.length > 0) headline += ` (${escape(envs.join(", "))})`;

  const linkTarget = safeLinkTarget(input.link);
  const link = linkTarget
    ? input.provider === "slack"
      ? `<${linkTarget}|View in EnvPilot>`
      : `[View in EnvPilot](${linkTarget})`
    : undefined;
  const context = [
    input.projectName ? escape(input.projectName) : undefined,
    input.action === "api.request_denied"
      ? `key owner ${escape(input.actorName)}`
      : `by ${escape(input.actorName)}`,
    link,
  ]
    .filter(Boolean)
    .join(" · ");

  const text = `${headline}\n${context}`;
  return input.provider === "discord"
    ? text.slice(0, MAX_DISCORD_CONTENT_LENGTH)
    : text;
}

export function buildWebhookRequest(input: {
  provider: WebhookProvider;
  url: string;
  text: string;
}): { endpoint: string; body: string } {
  const endpoint = input.url.replace(/\/+$/, "");
  return input.provider === "discord"
    ? {
        endpoint,
        body: JSON.stringify({
          content: input.text,
          allowed_mentions: { parse: [] },
        }),
      }
    : { endpoint, body: JSON.stringify({ text: input.text }) };
}

function retryAfterMilliseconds(value: string | null, now: number): number {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
}

export function providerRetryDelayMilliseconds(input: {
  retryAfter?: string | null;
  discordRetryAfterMs?: number;
  now?: number;
}): number {
  return Math.max(
    retryAfterMilliseconds(input.retryAfter ?? null, input.now ?? Date.now()),
    Math.max(0, input.discordRetryAfterMs ?? 0)
  );
}

export function deliveryDecision(input: {
  status: number;
  attempt: number;
  retryAfter?: string | null;
  discordRetryAfterMs?: number;
  now?: number;
}): { retry: boolean; delayMs: number } {
  const retryable =
    input.status === 0 ||
    input.status === 408 ||
    input.status === 425 ||
    input.status === 429 ||
    input.status >= 500;
  if (!retryable || input.attempt + 1 >= MAX_DELIVERY_ATTEMPTS) {
    return { retry: false, delayMs: 0 };
  }

  const providerDelay = providerRetryDelayMilliseconds(input);
  const exponentialDelay = 1_000 * 2 ** input.attempt;
  return {
    retry: true,
    delayMs: Math.min(
      MAX_RETRY_DELAY_MS,
      Math.max(1_000, providerDelay, exponentialDelay)
    ),
  };
}

export function failureCountAfterDelivery(
  status: number,
  currentFailureCount: number
): number {
  if (status === 429) return currentFailureCount;
  return status >= 200 && status < 300 ? 0 : currentFailureCount + 1;
}
