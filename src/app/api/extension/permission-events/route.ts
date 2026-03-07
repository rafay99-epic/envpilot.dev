import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { z } from 'zod'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const checkEventsSchema = z.object({
  // Limit to 50 tokens max to prevent DoS
  accessTokens: z.array(z.string().min(1)).max(50),
})

/**
 * POST /api/extension/permission-events - Check for permission revocation events
 *
 * This endpoint is polled by the VS Code extension to detect real-time
 * permission revocations. When a revocation event is detected, the extension
 * immediately clears cached variables and revokes local access.
 *
 * Security: Requires at least one valid access token to be provided.
 * The endpoint only returns events for the provided tokens, so an attacker
 * can only check status of tokens they already possess.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = checkEventsSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { accessTokens } = validation.data

    if (accessTokens.length === 0) {
      return NextResponse.json({
        data: {
          events: [],
          hasRevocations: false,
        },
      })
    }

    // Validate that at least one token exists before querying
    // This prevents probing for valid tokens
    let hasValidToken = false
    for (const token of accessTokens) {
      const validation = await convex.query(api.projectAccess.validateToken, {
        accessToken: token,
      })
      // Any known token (valid, revoked, expired, membership removed, etc.) is
      // acceptable here; only completely unknown tokens should be rejected.
      if (validation.valid || validation.reason !== 'Token not found') {
        hasValidToken = true
        break
      }
    }

    if (!hasValidToken) {
      return NextResponse.json(
        { error: 'No valid access tokens provided' },
        { status: 401 }
      )
    }

    // Check for pending revocation events for the given tokens
    const events = await convex.query(api.permissionRevocationEvents.checkForTokens, {
      accessTokens,
    })

    return NextResponse.json({
      data: {
        events,
        hasRevocations: events.length > 0,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check permission events'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * GET /api/extension/permission-events - SSE endpoint for real-time events
 *
 * This endpoint provides Server-Sent Events (SSE) for real-time permission
 * revocation notifications. The extension establishes a persistent connection
 * and receives events as they occur.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.headers.get('X-Access-Token')

  if (!accessToken) {
    return NextResponse.json({ error: 'Access token required' }, { status: 401 })
  }

  // Validate the token first
  const tokenValidation = await convex.query(api.projectAccess.validateToken, {
    accessToken,
  })

  if (!tokenValidation.valid) {
    return NextResponse.json(
      { error: tokenValidation.reason || 'Invalid token' },
      { status: 401 }
    )
  }

  // Create an SSE stream
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`)
      )

      // Polling interval for checking revocation events (5 seconds)
      const pollInterval = 5000
      let isActive = true

      const checkForEvents = async () => {
        if (!isActive) return

        try {
          const event = await convex.query(api.permissionRevocationEvents.checkForToken, {
            accessToken,
          })

          if (event) {
            // Send revocation event
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'revocation',
                  eventId: event.eventId,
                  projectId: event.projectId,
                  reason: event.reason,
                  revokedAt: event.revokedAt,
                })}\n\n`
              )
            )

            // Close the stream after sending revocation
            isActive = false
            controller.close()
            return
          }

          // Send heartbeat to keep connection alive
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
          )

          // Schedule next check
          if (isActive) {
            setTimeout(checkForEvents, pollInterval)
          }
        } catch (error) {
          // Send error event
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', message: 'Failed to check for events' })}\n\n`
            )
          )

          // Continue polling despite errors
          if (isActive) {
            setTimeout(checkForEvents, pollInterval * 2) // Back off on error
          }
        }
      }

      // Start polling
      checkForEvents()

      // Clean up on abort
      request.signal.addEventListener('abort', () => {
        isActive = false
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
