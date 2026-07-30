import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  decodeOAuthState,
  integrationProviderSchema,
  oauthStateCookie,
  type IntegrationProvider,
} from "@/lib/integration-oauth";

const DEFAULT_EVENT_GROUPS = ["variables", "requests"] as const;
const OAUTH_TIMEOUT_MS = 10_000;

type ProvisionedWebhook = {
  url: string;
  channel?: string;
};

function settingsRedirect(
  appUrl: URL,
  slug: string,
  params: Record<string, string>
): NextResponse {
  const target = new URL(
    `/organizations/${encodeURIComponent(slug)}/settings`,
    appUrl
  );
  target.searchParams.set("tab", "integrations");
  for (const [key, value] of Object.entries(params)) {
    target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target);
}

async function exchangeSlack(
  code: string,
  redirectUri: string
): Promise<ProvisionedWebhook> {
  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new Error("Slack OAuth is not configured");
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    incoming_webhook?: { url?: string; channel?: string };
  } | null;
  if (!response.ok || !data?.ok || !data.incoming_webhook?.url) {
    throw new Error(
      `Slack rejected the connection (${data?.error ?? response.status})`
    );
  }
  return {
    url: data.incoming_webhook.url,
    channel: data.incoming_webhook.channel,
  };
}

async function exchangeDiscord(
  code: string,
  redirectUri: string
): Promise<ProvisionedWebhook> {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth is not configured");
  }
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(OAUTH_TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => null)) as {
    error?: string;
    webhook?: { url?: string; name?: string };
  } | null;
  if (!response.ok || !data?.webhook?.url) {
    throw new Error(
      `Discord rejected the connection (${data?.error ?? response.status})`
    );
  }
  return { url: data.webhook.url, channel: data.webhook.name };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { user, accessToken } = await withAuth();
  if (!user || !accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const providerResult = integrationProviderSchema.safeParse(
    (await params).provider
  );
  if (!providerResult.success) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  const provider: IntegrationProvider = providerResult.data;

  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!configuredAppUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not configured" },
      { status: 500 }
    );
  }
  let appUrl: URL;
  try {
    appUrl = new URL(configuredAppUrl);
  } catch {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is invalid" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "";
  const cookieStore = await cookies();
  const cookieName = oauthStateCookie(provider);
  const storedState = cookieStore.get(cookieName)?.value;
  const clearState = (response: NextResponse) => {
    response.cookies.set(cookieName, "", {
      maxAge: 0,
      path: "/api/integrations",
    });
    return response;
  };

  // Match the exact opaque value before parsing any redirect metadata.
  if (!storedState || rawState !== storedState) {
    return clearState(
      NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
    );
  }
  const state = decodeOAuthState(rawState);
  if (!state || state.provider !== provider) {
    return clearState(
      NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 })
    );
  }

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code || code.length > 4_096) {
    return clearState(
      settingsRedirect(appUrl, state.slug, {
        integration_error: "Connection was cancelled.",
      })
    );
  }

  try {
    const convex = createAuthedConvexClient(accessToken);
    // Consent may have taken minutes. Revalidate role, tier, and remaining
    // capacity before creating a provider-side webhook.
    await convex.query(
      api.features.integrations.webhooks.getConnectEligibility,
      { organizationId: state.organizationId as Id<"organizations"> }
    );

    const redirectUri = new URL(
      `/api/integrations/${provider}/callback`,
      appUrl
    ).toString();
    const webhook: ProvisionedWebhook =
      provider === "slack"
        ? await exchangeSlack(code, redirectUri)
        : await exchangeDiscord(code, redirectUri);

    await convex.action(api.features.integrations.webhooks.create, {
      organizationId: state.organizationId as Id<"organizations">,
      name: webhook.channel ?? (provider === "slack" ? "Slack" : "Discord"),
      type: provider,
      source: "oauth",
      url: webhook.url,
      channel: webhook.channel,
      eventGroups: [...DEFAULT_EVENT_GROUPS],
    });

    return clearState(
      settingsRedirect(appUrl, state.slug, { connected: provider })
    );
  } catch (error) {
    // Do not delete a provider webhook here. A lost response after a committed
    // Convex action is indistinguishable from a failed write; deleting on an
    // ambiguous error could leave a live row pointing at dead credentials.
    console.error(`${provider} OAuth callback failed`, error);
    return clearState(
      settingsRedirect(appUrl, state.slug, {
        integration_error: sanitizeConvexError(error),
      })
    );
  }
}
