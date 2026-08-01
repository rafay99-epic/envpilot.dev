import { z } from "zod";

export const integrationProviderSchema = z.enum(["slack", "discord"]);
export type IntegrationProvider = z.infer<typeof integrationProviderSchema>;

export const integrationOAuthStateSchema = z.object({
  provider: integrationProviderSchema,
  organizationId: z.string().min(1).max(100),
  slug: z.string().min(1).max(200),
  nonce: z.uuid(),
});
export type IntegrationOAuthState = z.infer<typeof integrationOAuthStateSchema>;

export function parseIntegrationAppUrl(value: string | undefined): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function integrationAppUrlSupportsProvider(
  appUrl: URL,
  provider: IntegrationProvider
): boolean {
  if (appUrl.protocol === "https:") return true;
  if (provider !== "discord" || appUrl.protocol !== "http:") return false;
  return (
    appUrl.hostname === "localhost" ||
    appUrl.hostname === "127.0.0.1" ||
    appUrl.hostname === "::1"
  );
}

export function integrationProviderAvailability(
  appUrlValue: string | undefined,
  configured: { slack: boolean; discord: boolean }
): { slack: boolean; slackRequiresHttps: boolean; discord: boolean } {
  const appUrl = parseIntegrationAppUrl(appUrlValue);
  const slackAvailable = appUrl
    ? integrationAppUrlSupportsProvider(appUrl, "slack")
    : false;
  const discordAvailable = appUrl
    ? integrationAppUrlSupportsProvider(appUrl, "discord")
    : false;
  return {
    slack: configured.slack && slackAvailable,
    slackRequiresHttps: configured.slack && Boolean(appUrl) && !slackAvailable,
    discord: configured.discord && discordAvailable,
  };
}

export function integrationEligibilityErrorStatus(
  error: unknown
): 400 | 403 | 502 {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /ArgumentValidationError/i.test(message) &&
    /organizationId|v\.id\(["']organizations["']\)/i.test(message)
  ) {
    return 400;
  }
  if (
    error instanceof Error &&
    "data" in error &&
    typeof (error as Error & { data: unknown }).data === "string"
  ) {
    return 403;
  }
  return 502;
}

export function oauthStateCookie(
  provider: IntegrationProvider,
  nonce: string
): string {
  const safeNonce = z.uuid().parse(nonce);
  return `envpilot_integration_state_${provider}_${safeNonce}`;
}

export function encodeOAuthState(state: IntegrationOAuthState): string {
  return Buffer.from(JSON.stringify(state)).toString("base64url");
}

export function decodeOAuthState(value: string): IntegrationOAuthState | null {
  if (!value || value.length > 1_024) return null;
  try {
    return integrationOAuthStateSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString())
    );
  } catch {
    return null;
  }
}
