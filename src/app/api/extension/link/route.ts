import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { z } from 'zod'
import { getOrCreateConvexUser, checkOrganizationMembership, getProjectOrganization } from '@/lib/convex-helpers'
import { checkTierLimit } from '@/lib/tier-limits'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const linkExtensionSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceName: z.string().min(1, 'Device name is required'),
  expiresInDays: z.number().min(1).max(365).optional().default(30),
})

/**
 * POST /api/extension/link - Link an extension to a project
 */
export async function POST(request: Request) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validation = linkExtensionSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { projectId, deviceId, deviceName, expiresInDays } = validation.data

    const convexUser = await getOrCreateConvexUser(convex, user)

    // Get project and verify membership
    const { project, organizationId } = await getProjectOrganization(
      convex,
      projectId as Id<'projects'>
    )

    if (!project || !organizationId) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    const membership = await checkOrganizationMembership(
      convex,
      convexUser._id,
      organizationId
    )

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      )
    }

    // Check tier limits for extension access
    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const tierCheck = checkTierLimit(organization.tier, 'extensionAccessEnabled')
    if (!tierCheck.allowed) {
      return NextResponse.json(
        { error: tierCheck.message, code: 'TIER_LIMIT_EXCEEDED' },
        { status: 402 }
      )
    }

    // Link the extension
    const access = await convex.mutation(api.projectAccess.linkExtension, {
      projectId: projectId as Id<'projects'>,
      userId: convexUser._id,
      deviceId,
      deviceName,
      expiresInDays,
    })

    return NextResponse.json({
      data: {
        access: {
          _id: access.accessId,
          accessToken: access.accessToken,
          expiresAt: Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to link extension'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
