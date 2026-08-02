import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { integrationProviderAvailability } from "@/lib/integration-oauth";

/**
 * GET /api/integrations/providers — which OAuth connect flows are available.
 *
 * A provider is available when its OAuth app credentials are configured on
 * the server. Self-hosted deployments without them fall back to manual
 * webhook-URL entry; the UI hides the Connect buttons.
 */
export async function GET() {
  const { user } = await withAuth();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const slackConfigured = Boolean(
    process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET
  );
  const discordConfigured = Boolean(
    process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
  );
  // Discord accepts an HTTP localhost callback, which keeps its local setup
  // usable without weakening Slack's HTTPS-only OAuth requirement.
  return NextResponse.json(
    integrationProviderAvailability(process.env.NEXT_PUBLIC_APP_URL, {
      slack: slackConfigured,
      discord: discordConfigured,
    })
  );
}
