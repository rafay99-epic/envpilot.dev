import type { IntegrationProvider } from "@/lib/integration-oauth";

const CLEANUP_TIMEOUT_MS = 10_000;

export type ProvisionedWebhook = {
  url: string;
  channel?: string;
};

/**
 * ConvexError data is returned only after the action completed with a known
 * application failure. Generic transport errors remain ambiguous: the write
 * may have committed after the caller lost its response.
 */
export function isDefinitiveConvexFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    "data" in error &&
    typeof (error as Error & { data: unknown }).data === "string"
  );
}

function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "discord.com" || url.hostname === "discordapp.com") &&
      /^\/api\/webhooks\/[^/]+\/[^/]+\/?$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Undo granular provider provisioning after a definitive backend rejection.
 * Discord deletion is idempotent, so one retry is safe after a transient
 * failure. Secret URLs are never included in errors or logs.
 */
export async function rollbackProvisionedWebhook(
  provider: IntegrationProvider,
  webhook: ProvisionedWebhook
): Promise<boolean> {
  // Slack does not expose granular deletion for an OAuth-created incoming
  // webhook. auth.revoke removes every webhook tied to the bot token and can
  // break the user's other connected channels, so it is intentionally never
  // used as compensation here.
  if (provider === "slack") return false;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!isDiscordWebhookUrl(webhook.url)) return false;
      const response = await fetch(webhook.url, {
        method: "DELETE",
        signal: AbortSignal.timeout(CLEANUP_TIMEOUT_MS),
      });
      if (response.ok || response.status === 404) return true;
    } catch {
      // Retry once. The caller emits only a credential-free diagnostic.
    }
  }
  return false;
}
