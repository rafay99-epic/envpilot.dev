import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { z } from 'zod'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const refreshTokenSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
})

/**
 * POST /api/extension/refresh-token - Refresh an access token's expiration
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const validation = refreshTokenSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { accessToken, expiresInDays } = validation.data

    const result = await convex.mutation(api.projectAccess.refresh, {
      accessToken,
      expiresInDays,
    })

    return NextResponse.json({
      data: result,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to refresh token'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
