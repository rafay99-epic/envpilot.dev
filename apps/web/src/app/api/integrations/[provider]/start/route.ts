import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/integrations/start");
import {
  encodeOAuthState,
  integrationAppUrlSupportsProvider,
  integrationEligibilityErrorStatus,
  integrationProviderSchema,
  oauthStateCookie,
  parseIntegrationAppUrl,
} from "@/lib/integration-oauth";

/**
 * POST, not GET: this hands back an authorize URL and sets the httpOnly OAuth
 * state cookie that the callback validates against. A GET that writes a cookie
 * can be fired by a link prefetch or a forged cross-site request, which would
 * overwrite a live state cookie mid-flow. The only caller is the Connect
 * button in the integrations settings panel, which posts to it directly.
 */
export async function POST(
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
  const provider = providerResult.data;
  const requestUrl = new URL(request.url);
  const organizationId = requestUrl.searchParams.get("organizationId");
  const wantsJson = requestUrl.searchParams.get("format") === "json";
  if (!organizationId || organizationId.length > 100) {
    return NextResponse.json(
      { error: "A valid organizationId is required" },
      { status: 400 }
    );
  }

  let eligibility: { slug: string };
  try {
    eligibility = await createAuthedConvexClient(accessToken).query(
      api.features.integrations.webhooks.getConnectEligibility,
      { organizationId: organizationId as Id<"organizations"> }
    );
  } catch (error) {
    const status = integrationEligibilityErrorStatus(error);
    if (status === 400) {
      return NextResponse.json(
        { error: "A valid organizationId is required" },
        { status: 400 }
      );
    }
    if (status === 502) {
      log.error("integration_eligibility_lookup_failed", { provider }, error);
      return NextResponse.json(
        { error: "Could not verify integration access. Try again." },
        { status: 502 }
      );
    }
    return NextResponse.json(
      { error: sanitizeConvexError(error) },
      { status: 403 }
    );
  }

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
            ? "Slack OAuth requires an HTTPS NEXT_PUBLIC_APP_URL. Use trusted local HTTPS, a temporary HTTPS tunnel, or add a Slack webhook manually."
            : "Discord OAuth requires HTTPS except on localhost.",
      },
      { status: 400 }
    );
  }

  const redirectUri = new URL(
    `/api/integrations/${provider}/callback`,
    appUrl
  ).toString();
  const oauthState = {
    provider,
    organizationId,
    slug: eligibility.slug,
    nonce: crypto.randomUUID(),
  };
  const state = encodeOAuthState(oauthState);

  let authorizeUrl: URL;
  if (provider === "slack") {
    const clientId = process.env.SLACK_CLIENT_ID;
    if (!clientId || !process.env.SLACK_CLIENT_SECRET) {
      return NextResponse.json(
        { error: "Slack OAuth is not configured" },
        { status: 404 }
      );
    }
    authorizeUrl = new URL("https://slack.com/oauth/v2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("scope", "incoming-webhook");
  } else {
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId || !process.env.DISCORD_CLIENT_SECRET) {
      return NextResponse.json(
        { error: "Discord OAuth is not configured" },
        { status: 404 }
      );
    }
    authorizeUrl = new URL("https://discord.com/oauth2/authorize");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("scope", "webhook.incoming");
    authorizeUrl.searchParams.set("response_type", "code");
  }
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const response = wantsJson
    ? NextResponse.json({ url: authorizeUrl.toString() })
    : NextResponse.redirect(authorizeUrl);
  // Store the exact state in an httpOnly cookie. Matching the whole value,
  // rather than only its nonce, prevents organization/slug tampering.
  response.cookies.set(oauthStateCookie(provider, oauthState.nonce), state, {
    httpOnly: true,
    secure: appUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations",
  });
  return response;
}
