import { NextResponse } from "next/server";

/**
 * GET /api/status — aggregated uptime status for the marketing footer.
 *
 * Proxies the UptimeRobot v2 API server-side so the read-only API key never
 * reaches the browser, and caches the result for 5 minutes so visitor
 * traffic can't exhaust the UptimeRobot rate limit (10 req/min on free).
 *
 * Returns { status: "operational" | "degraded" | "down" | "unknown" }.
 * "unknown" means no API key is configured — the footer falls back to a
 * static link to the public status page.
 */

export const dynamic = "force-static";
export const revalidate = 300;

// UptimeRobot monitor status codes: 0 paused, 1 not checked yet, 2 up,
// 8 seems down, 9 down.
const UP = 2;
const PAUSED = 0;
const NOT_CHECKED = 1;

// react-doctor flags the POST below as a GET-handler side effect. It isn't:
// UptimeRobot's getMonitors is a read that its API only exposes over POST, and
// nothing here mutates state on our side. Nothing to move to a POST handler.
// oxlint-disable-next-line react-doctor/nextjs-no-side-effect-in-get-handler
export async function GET() {
  const apiKey = process.env.UPTIMEROBOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ status: "unknown" });
  }

  try {
    const response = await fetch("https://api.uptimerobot.com/v2/getMonitors", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_key: apiKey, format: "json" }),
      cache: "no-store", // route-level revalidate handles caching
    });

    if (!response.ok) {
      return NextResponse.json({ status: "unknown" });
    }

    const data = (await response.json()) as {
      stat?: string;
      monitors?: Array<{ status: number }>;
    };

    if (data.stat !== "ok" || !data.monitors?.length) {
      return NextResponse.json({ status: "unknown" });
    }

    const active = data.monitors.filter(
      (m) => m.status !== PAUSED && m.status !== NOT_CHECKED
    );
    const downCount = active.filter((m) => m.status !== UP).length;

    const status =
      active.length === 0 || downCount === 0
        ? "operational"
        : downCount === active.length
          ? "down"
          : "degraded";

    return NextResponse.json({ status });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
