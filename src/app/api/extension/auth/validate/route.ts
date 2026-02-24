import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../../convex/_generated/api'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * GET /api/extension/auth/validate - Validate the current auth session
 */
export async function GET() {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { data: { valid: false, reason: 'Not authenticated' } },
        { status: 200 }
      )
    }

    // Verify user exists in Convex
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    })

    if (!convexUser) {
      return NextResponse.json(
        { data: { valid: false, reason: 'User not found' } },
        { status: 200 }
      )
    }

    return NextResponse.json({
      data: { valid: true },
    })
  } catch {
    return NextResponse.json(
      { data: { valid: false, reason: 'Validation failed' } },
      { status: 200 }
    )
  }
}
