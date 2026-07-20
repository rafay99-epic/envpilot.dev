import { NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";

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
  return NextResponse.json({
    slack: Boolean(
      process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET
    ),
    discord: Boolean(
      process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
    ),
  });
}
