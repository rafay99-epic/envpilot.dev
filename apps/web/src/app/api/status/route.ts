import { NextResponse } from "next/server";

/**
 * GET /api/status — aggregated uptime status for the marketing footer.
 *
 * Reads the Instatus page summary, which is public JSON (no API key, no rate
 * limit), and caches for 5 minutes so visitor traffic never stampedes it.
 *
 * Returns { status: "operational" | "degraded" | "down" | "unknown" }.
 * "unknown" means the summary was unreachable — the footer falls back to a
 * static link to the public status page.
 */

export const dynamic = "force-static";
export const revalidate = 300;

const STATUS_PAGE_URL =
  process.env.NEXT_PUBLIC_STATUS_PAGE_URL || "https://abdul-86zax.instatus.com";

// Instatus page-level status values. UNDERMAINTENANCE is deliberately mapped
// to "degraded" rather than "down": planned work is a disruption, not an
// outage.
const STATUS_MAP: Record<string, "operational" | "degraded" | "down"> = {
  UP: "operational",
  HASISSUES: "degraded",
  UNDERMAINTENANCE: "degraded",
  ALLMAJOROUTAGE: "down",
  DOWN: "down",
};

export async function GET() {
  try {
    const response = await fetch(`${STATUS_PAGE_URL}/summary.json`, {
      cache: "no-store", // route-level revalidate handles caching
    });

    if (!response.ok) {
      return NextResponse.json({ status: "unknown" });
    }

    const data = (await response.json()) as { page?: { status?: string } };
    const status = STATUS_MAP[data.page?.status ?? ""] ?? "unknown";

    return NextResponse.json({ status });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
