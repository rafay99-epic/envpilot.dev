import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { z } from 'zod'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  logoUrl: z.string().url().optional(),
})

type RouteParams = { params: Promise<{ id: string }> }

/**
 * GET /api/organizations/[id] - Get a single organization
 */
export async function GET(
  _request: Request,
  { params }: RouteParams
) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const organizationId = resolvedParams.id as Id<'organizations'>

    // Verify user exists
    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    })

    if (!convexUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    })

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 }
      )
    }

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      organization: { ...organization, role: membership.role },
    })
  } catch (error) {
    console.error('Error fetching organization:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/organizations/[id] - Update an organization
 */
export async function PATCH(
  request: Request,
  { params }: RouteParams
) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const organizationId = resolvedParams.id as Id<'organizations'>

    const body = await request.json()
    const validation = updateOrgSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    })

    if (!convexUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if user is an admin
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    })

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can update organization settings' },
        { status: 403 }
      )
    }

    const { name, description, logoUrl } = validation.data

    await convex.mutation(api.organizations.update, {
      organizationId,
      name,
      description,
      logoUrl,
      updatedBy: convexUser._id,
    })

    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    })

    return NextResponse.json({ organization })
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/organizations/[id] - Delete an organization
 */
export async function DELETE(
  _request: Request,
  { params }: RouteParams
) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const resolvedParams = await params
    const organizationId = resolvedParams.id as Id<'organizations'>

    const convexUser = await convex.query(api.users.getByWorkosId, {
      workosId: user.id,
    })

    if (!convexUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Check if user is the creator/owner
    const organization = await convex.query(api.organizations.getById, {
      organizationId,
    })

    if (!organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const membership = await convex.query(api.organizations.getMembership, {
      organizationId,
      userId: convexUser._id,
    })

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can delete the organization' },
        { status: 403 }
      )
    }

    await convex.mutation(api.organizations.remove, {
      organizationId,
      deletedBy: convexUser._id,
    })

    return NextResponse.json({ deleted: true })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json(
      { error: 'Failed to delete organization' },
      { status: 500 }
    )
  }
}
