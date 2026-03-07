import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { z } from 'zod'
import { getOrCreateConvexUser, checkOrganizationMembership, getProjectOrganization } from '@/lib/convex-helpers'
import { createSecret } from '@/lib/vault'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const updateVariableSchema = z.object({
  value: z.string().min(1).optional(),
  description: z.string().max(500).optional(),
  environments: z.array(z.enum(['development', 'staging', 'production'])).min(1).optional(),
  isSensitive: z.boolean().optional(),
  changeReason: z.string().max(200).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/variables/[id] - Get a single variable with version history
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { id } = await context.params

    const convexUser = await getOrCreateConvexUser(convex, user)

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<'environmentVariables'>,
    })

    if (!variable) {
      return NextResponse.json(
        { error: 'Variable not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    )

    if (!organizationId) {
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

    // Members can only view variables they can access.
    if (membership.role === 'member') {
      const accessibleVariables = await convex.query(api.variables.listWithAccess, {
        projectId: variable.projectId,
        userId: convexUser._id,
      })

      const canAccessVariable = accessibleVariables.some(
        (entry) => entry._id === variable._id && entry.hasAccess
      )

      if (!canAccessVariable) {
        return NextResponse.json(
          { error: 'You do not have access to this variable' },
          { status: 403 }
        )
      }
    }

    // Get version history
    const { searchParams } = new URL(request.url)
    const includeHistory = searchParams.get('includeHistory') === 'true'

    let history = null
    if (includeHistory) {
      history = await convex.query(api.variables.getVersionHistory, {
        variableId: id as Id<'environmentVariables'>,
        limit: 50,
      })
    }

    return NextResponse.json({ variable, history })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch variable' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/variables/[id] - Update a variable
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { id } = await context.params
    const body = await request.json()
    const validation = updateVariableSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const convexUser = await getOrCreateConvexUser(convex, user)

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<'environmentVariables'>,
    })

    if (!variable) {
      return NextResponse.json(
        { error: 'Variable not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    )

    if (!organizationId) {
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

    // Check permission (admin or team_lead can update variables)
    if (membership.role !== 'admin' && membership.role !== 'team_lead') {
      return NextResponse.json(
        { error: 'Insufficient permissions to update variables' },
        { status: 403 }
      )
    }

    const { value, description, environments, isSensitive, changeReason } = validation.data

    // If value is being updated, write a new encrypted value to Vault.
    let vaultRef: string | undefined
    if (value !== undefined) {
      const vaultResult = await createSecret(variable.key, value, {
        organizationId,
        projectId: variable.projectId,
      })
      vaultRef = vaultResult.id
    }

    await convex.mutation(api.variables.update, {
      variableId: id as Id<'environmentVariables'>,
      vaultRef,
      description,
      environments,
      isSensitive,
      updatedBy: convexUser._id,
      changeReason,
    })

    const updatedVariable = await convex.query(api.variables.getById, {
      variableId: id as Id<'environmentVariables'>,
    })

    return NextResponse.json({ variable: updatedVariable })
  } catch {
    return NextResponse.json(
      { error: 'Failed to update variable' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/variables/[id] - Soft delete a variable
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { id } = await context.params

    const convexUser = await getOrCreateConvexUser(convex, user)

    const variable = await convex.query(api.variables.getById, {
      variableId: id as Id<'environmentVariables'>,
    })

    if (!variable) {
      return NextResponse.json(
        { error: 'Variable not found' },
        { status: 404 }
      )
    }

    // Verify user has access to the project
    const { organizationId } = await getProjectOrganization(
      convex,
      variable.projectId
    )

    if (!organizationId) {
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

    // Check permission (admin or team_lead can delete variables)
    if (membership.role !== 'admin' && membership.role !== 'team_lead') {
      return NextResponse.json(
        { error: 'Insufficient permissions to delete variables' },
        { status: 403 }
      )
    }

    await convex.mutation(api.variables.remove, {
      variableId: id as Id<'environmentVariables'>,
      deletedBy: convexUser._id,
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: 'Failed to delete variable' },
      { status: 500 }
    )
  }
}
