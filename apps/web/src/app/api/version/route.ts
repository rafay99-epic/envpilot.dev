import { NextResponse } from "next/server";
import { APP_VERSIONS } from "@/lib/versions";
import { cacheHeaders } from "@/lib/cache-headers";

/**
 * GET /api/version
 * Public endpoint returning current release versions for all surfaces.
 * Used by the web app, CLI, and VS Code extension to detect updates and to
 * enforce the minCli / minExtension hard block. No auth required.
 *
 * Cached at the CDN: the payload is a build-time constant, so serving it
 * from a function on every CLI invocation was pure waste. `publicLong` is
 * s-maxage=300, so a release is visible to clients within 5 minutes — well
 * inside the extension's hourly refetch and the banner's poll. Purge the
 * cache if a hard block ever needs to land faster than that.
 */
export async function GET() {
  return NextResponse.json(APP_VERSIONS, { headers: cacheHeaders.publicLong });
}
