import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../../convex/_generated/api'
import type { Id } from '../../../../../../convex/_generated/dataModel'
import { getOrCreateConvexUser, checkOrganizationMembership } from '@/lib/convex-helpers'
import { checkTierLimit } from '@/lib/tier-limits'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

interface RouteParams {
  params: Promise<{
    organizationId: string
  }>
}

/**
 * GET /api/extension/check-access/[organizationId] - Check if extension access is enabled
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { organizationId } = await params

    const convexUser = await getOrCreateConvexUser(convex, user)

    // Check membership
    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId as Id<'organizations'>
    )

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Get organization tier
    const organization = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<'organizations'>,
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const tierCheck = checkTierLimit(organization.tier, 'extensionAccessEnabled')

    return NextResponse.json({
      data: {
        enabled: tierCheck.allowed,
        reason: tierCheck.allowed ? undefined : tierCheck.message,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check access'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
