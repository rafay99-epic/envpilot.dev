import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { z } from 'zod'
import { getStripeClient, isPaymentsEnabled } from '@/lib/stripe'
import type { Id } from '../../../../../convex/_generated/dataModel'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const portalSchema = z.object({
  organizationId: z.string().min(1, 'Organization ID is required'),
  returnUrl: z.string().url('Return URL must be a valid URL'),
})

/**
 * POST /api/billing/portal
 * Create a Stripe Billing Portal session for managing subscriptions
 */
export async function POST(request: Request) {
  try {
    // Check if payments are enabled
    if (!isPaymentsEnabled()) {
      return NextResponse.json(
        { error: 'Payment system is currently disabled' },
        { status: 503 }
      )
    }

    const stripe = getStripeClient()

    if (!stripe) {
      return NextResponse.json(
        { error: 'Payment system is not properly configured' },
        { status: 503 }
      )
    }

    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = portalSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { organizationId, returnUrl } = validation.data

    // Get Convex user
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    })

    if (!convexUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Verify user is admin of the organization
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<'organizations'>,
      userId: convexUser._id,
    })

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only organization admins can access billing' },
        { status: 403 }
      )
    }

    // Get Stripe customer for this organization
    const stripeCustomer = await convex.query(api.subscriptions.getStripeCustomer, {
      organizationId: organizationId as Id<'organizations'>,
    })

    if (!stripeCustomer) {
      return NextResponse.json(
        { error: 'No billing account found. Please subscribe first.' },
        { status: 404 }
      )
    }

    // Create billing portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomer.stripeCustomerId,
      return_url: returnUrl,
    })

    return NextResponse.json({
      portalUrl: session.url,
    })
  } catch (error) {
    console.error('Error creating billing portal session:', error)
    const message = error instanceof Error ? error.message : 'Failed to create billing portal session'

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
