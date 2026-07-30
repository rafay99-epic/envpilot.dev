import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { sanitizeConvexError } from "@/lib/error-messages";
import {
  encodeOAuthState,
  integrationProviderSchema,
  oauthStateCookie,
} from "@/lib/integration-oauth";

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
  const provider = providerResult.data;
  const organizationId = new URL(request.url).searchParams.get(
    "organizationId"
  );
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
  let appUrl: URL;
  try {
    appUrl = new URL(configuredAppUrl);
    if (appUrl.protocol !== "http:" && appUrl.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is invalid" },
      { status: 500 }
    );
  }
  if (provider === "slack" && appUrl.protocol !== "https:") {
    return NextResponse.json(
      {
        error:
          "Slack OAuth requires an HTTPS NEXT_PUBLIC_APP_URL. Use trusted local HTTPS, a temporary HTTPS tunnel, or add a Slack webhook manually.",
      },
      { status: 400 }
    );
  }

  const redirectUri = new URL(
    `/api/integrations/${provider}/callback`,
    appUrl
  ).toString();
  const state = encodeOAuthState({
    provider,
    organizationId,
    slug: eligibility.slug,
    nonce: crypto.randomUUID(),
  });

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

  const response = NextResponse.redirect(authorizeUrl);
  // Store the exact state in an httpOnly cookie. Matching the whole value,
  // rather than only its nonce, prevents organization/slug tampering.
  response.cookies.set(oauthStateCookie(provider), state, {
    httpOnly: true,
    secure: appUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations",
  });
  return response;
}
