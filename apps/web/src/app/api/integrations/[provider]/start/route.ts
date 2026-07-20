import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { OAUTH_STATE_COOKIE } from "@/lib/integration-oauth";

/**
 * GET /api/integrations/[provider]/start?organizationId=...&slug=...
 *
 * Kicks off the OAuth connect flow. The platform's own consent screen picks
 * the channel; the callback receives a ready-made webhook URL — the user
 * never digs a URL out of Slack/Discord admin screens.
 *
 * CSRF: a random nonce goes into both the `state` param and a short-lived
 * httpOnly cookie; the callback requires them to match.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { provider } = await params;
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organizationId");
  const slug = url.searchParams.get("slug");
  if (!organizationId || !slug) {
    return NextResponse.json(
      { error: "organizationId and slug are required" },
      { status: 400 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL is not configured" },
      { status: 500 }
    );
  }
  const redirectUri = `${appUrl}/api/integrations/${provider}/callback`;

  const nonce = crypto.randomUUID();
  const state = Buffer.from(
    JSON.stringify({ organizationId, slug, nonce })
  ).toString("base64url");

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
  } else if (provider === "discord") {
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
  } else {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: appUrl.startsWith("https://"),
    sameSite: "lax",
    maxAge: 600,
    path: "/api/integrations",
  });
  return response;
}
