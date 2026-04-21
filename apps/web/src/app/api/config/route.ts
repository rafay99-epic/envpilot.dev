import { NextResponse } from "next/server";
import { getClientFeatureFlags } from "@/lib/feature-flags";
import { cacheHeaders } from "@/lib/cache-headers";

/**
 * GET /api/config
 * Returns client-safe configuration including feature flags
 */
export async function GET() {
  return NextResponse.json(
    {
      features: getClientFeatureFlags(),
    },
    { headers: cacheHeaders.publicLong }
  );
}
