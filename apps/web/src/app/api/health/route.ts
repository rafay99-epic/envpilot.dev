import { NextResponse } from "next/server";

import { APP_VERSIONS } from "@/lib/versions";

/**
 * GET /api/health — liveness probe for the external status page.
 *
 * 200 when the web app is serving AND its Convex deployment answers, 503
 * otherwise, so an uptime monitor asserting 200 catches a backend outage that
 * a plain homepage check would report as green.
 *
 * Deliberately cheap: Convex is checked by reaching its deployment URL, NOT by
 * running a query. A monitor hits this every few minutes forever, and a query
 * here would bill Database I/O on every check.
 *
 * Never returns dependency error text — a public probe must not leak infra
 * detail. Booleans and latency only.
 */

export const dynamic = "force-dynamic";

const CONVEX_TIMEOUT_MS = 5000;

async function checkConvex(): Promise<{ ok: boolean; ms: number }> {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const started = Date.now();
  if (!url) return { ok: false, ms: 0 };

  try {
    // Any HTTP response proves the deployment is reachable; the status code
    // itself is irrelevant (the root path is not an API route).
    await fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(CONVEX_TIMEOUT_MS),
    });
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

export async function GET() {
  const convex = await checkConvex();
  const ok = convex.ok;

  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      version: APP_VERSIONS.web,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      checks: { convex },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
