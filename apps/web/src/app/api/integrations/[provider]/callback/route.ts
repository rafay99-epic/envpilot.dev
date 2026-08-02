import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  decodeOAuthState,
  integrationAppUrlSupportsProvider,
  integrationProviderSchema,
  oauthStateCookie,
  parseIntegrationAppUrl,
  type IntegrationProvider,
} from "@/lib/integration-oauth";
import {
  isDefinitiveConvexFailure,
  rollbackProvisionedWebhook,
  type ProvisionedWebhook,
} from "@/lib/integration-provider-cleanup";

const DEFAULT_EVENT_GROUPS = ["variables", "requests"] as const;
const OAUTH_TIMEOUT_MS = 10_000;

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
  const appUrl = parseIntegrationAppUrl(configuredAppUrl);
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is invalid" },
      { status: 500 }
    );
  }
  if (!integrationAppUrlSupportsProvider(appUrl, provider)) {
    return NextResponse.json(
      {
        error:
          provider === "slack"
            ? "Slack OAuth requires an HTTPS NEXT_PUBLIC_APP_URL"
            : "Discord OAuth requires HTTPS except on localhost",
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const rawState = url.searchParams.get("state") ?? "";
  const state = decodeOAuthState(rawState);
  if (!state || state.provider !== provider) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }
  const cookieStore = await cookies();
  const cookieName = oauthStateCookie(provider, state.nonce);
  const storedState = cookieStore.get(cookieName)?.value;
  const clearState = (response: NextResponse) => {
    response.cookies.set(cookieName, "", {
      maxAge: 0,
      path: "/api/integrations",
    });
    return response;
  };

  // The state is parsed only to select its nonce-scoped cookie. Matching the
  // exact opaque value still protects every redirect field from tampering and
  // lets concurrent connections to the same provider complete independently.
  if (!storedState || rawState !== storedState) {
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

  let provisionedWebhook: ProvisionedWebhook | null = null;
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
    provisionedWebhook =
      provider === "slack"
        ? await exchangeSlack(code, redirectUri)
        : await exchangeDiscord(code, redirectUri);

    await convex.action(api.features.integrations.webhooks.create, {
      organizationId: state.organizationId as Id<"organizations">,
      name:
        provisionedWebhook.channel ??
        (provider === "slack" ? "Slack" : "Discord"),
      type: provider,
      source: "oauth",
      url: provisionedWebhook.url,
      channel: provisionedWebhook.channel,
      eventGroups: [...DEFAULT_EVENT_GROUPS],
    });

    return clearState(
      settingsRedirect(appUrl, state.slug, { connected: provider })
    );
  } catch (error) {
    // Explicit ConvexError data proves the action completed with a rejected
    // write, so compensate provider provisioning. A generic/transport error
    // remains ambiguous and must not delete a possibly committed destination.
    if (
      provider === "discord" &&
      provisionedWebhook &&
      isDefinitiveConvexFailure(error)
    ) {
      const rolledBack = await rollbackProvisionedWebhook(
        provider,
        provisionedWebhook
      );
      if (!rolledBack) {
        console.error(`${provider} OAuth provider cleanup failed`);
      }
    }
    console.error(`${provider} OAuth callback failed`, error);
    return clearState(
      settingsRedirect(appUrl, state.slug, {
        integration_error: sanitizeConvexError(error),
      })
    );
  }
}
