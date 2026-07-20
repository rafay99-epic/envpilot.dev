import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import { OAUTH_STATE_COOKIE } from "@/lib/integration-oauth";

/**
 * GET /api/integrations/[provider]/callback — OAuth code exchange.
 *
 * Slack (scope incoming-webhook) and Discord (scope webhook.incoming) both
 * CREATE the webhook during consent and return its URL in the token
 * response. We keep the webhook URL + channel name and discard the access
 * token — EnvPilot never stores a platform token at rest.
 */

const DEFAULT_EVENT_GROUPS = ["variables", "requests"];

function settingsRedirect(
  appUrl: string,
  slug: string,
  params: Record<string, string>
): NextResponse {
  const target = new URL(`${appUrl}/organizations/${slug}/settings`);
  target.searchParams.set("tab", "integrations");
  for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
  return NextResponse.redirect(target);
}

async function exchangeSlack(
  code: string,
  redirectUri: string
): Promise<{ url: string; channel?: string }> {
  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    incoming_webhook?: { url?: string; channel?: string };
  };
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new Error(
      `Slack rejected the connection (${data.error ?? "no webhook returned"})`
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
): Promise<{ url: string; channel?: string }> {
  const res = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const data = (await res.json()) as {
    error?: string;
    webhook?: { url?: string; name?: string };
  };
  if (!data.webhook?.url) {
    throw new Error(
      `Discord rejected the connection (${data.error ?? "no webhook returned"})`
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

  const { provider } = await params;
  if (provider !== "slack" && provider !== "discord") {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not configured" },
      { status: 500 }
    );
  }

  // Decode state — it carries where to land afterwards, so it's parsed
  // before nonce verification and used only for redirects on failure.
  const url = new URL(request.url);
  let state: { organizationId?: string; slug?: string; nonce?: string } = {};
  try {
    state = JSON.parse(
      Buffer.from(url.searchParams.get("state") ?? "", "base64url").toString()
    );
  } catch {
    // fall through — missing pieces handled below
  }
  const slug = state.slug;
  if (!slug || !state.organizationId) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const nonce = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const clearNonce = (r: NextResponse) => {
    r.cookies.set(OAUTH_STATE_COOKIE, "", {
      maxAge: 0,
      path: "/api/integrations",
    });
    return r;
  };
  if (!nonce || nonce !== state.nonce) {
    return clearNonce(
      settingsRedirect(appUrl, slug, {
        integration_error:
          "Connection could not be verified — please try again.",
      })
    );
  }

  const code = url.searchParams.get("code");
  if (url.searchParams.get("error") || !code) {
    // User hit Cancel on the consent screen (or the platform errored)
    return clearNonce(
      settingsRedirect(appUrl, slug, {
        integration_error: "Connection was cancelled.",
      })
    );
  }

  try {
    const redirectUri = `${appUrl}/api/integrations/${provider}/callback`;
    const webhook =
      provider === "slack"
        ? await exchangeSlack(code, redirectUri)
        : await exchangeDiscord(code, redirectUri);

    await createAuthedConvexClient(accessToken).mutation(
      api.features.integrations.webhooks.create,
      {
        organizationId: state.organizationId as Id<"organizations">,
        name: webhook.channel ?? (provider === "slack" ? "Slack" : "Discord"),
        type: provider,
        source: "oauth",
        url: webhook.url,
        channel: webhook.channel,
        eventGroups: DEFAULT_EVENT_GROUPS,
      }
    );

    return clearNonce(settingsRedirect(appUrl, slug, { connected: provider }));
  } catch (err) {
    console.error(`${provider} OAuth callback failed:`, err);
    return clearNonce(
      settingsRedirect(appUrl, slug, {
        integration_error: sanitizeConvexError(err),
      })
    );
  }
}
