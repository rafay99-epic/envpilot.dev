import { NextResponse } from 'next/server'
import { getClientFeatureFlags } from '@/lib/feature-flags'

/**
 * GET /api/config
 * Returns client-safe configuration including feature flags
 */
export async function GET() {
  return NextResponse.json({
    features: getClientFeatureFlags(),
  })
}
