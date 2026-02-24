import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { z } from 'zod'
import { getOrCreateConvexUser, checkOrganizationMembership, getProjectOrganization } from '@/lib/convex-helpers'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const createVariableSchema = z.object({
  key: z.string()
    .min(1, 'Key is required')
    .max(100, 'Key must be 100 characters or less')
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Key must be uppercase, start with a letter, and contain only letters, numbers, and underscores'),
  value: z.string().min(1, 'Value is required'),
  description: z.string().max(500).optional(),
  environments: z.array(z.enum(['development', 'staging', 'production'])).min(1, 'At least one environment is required'),
  projectId: z.string().min(1, 'Project ID is required'),
  isSensitive: z.boolean().optional().default(false),
})

/**
 * GET /api/variables - List variables for a project
 */
export async function GET(request: Request) {
  try {
    const { user } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const environment = searchParams.get('environment')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

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

    const variables = await convex.query(api.variables.listByProject, {
      projectId: projectId as Id<'projects'>,
      environment: environment || undefined,
    })

    return NextResponse.json({ variables })
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch variables' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/variables - Create a new environment variable
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
    const validation = createVariableSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      )
    }

    const { key, value, description, environments, projectId, isSensitive } = validation.data

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

    // Check permission (admin or team_lead can create variables)
    if (membership.role !== 'admin' && membership.role !== 'team_lead') {
      return NextResponse.json(
        { error: 'Insufficient permissions to create variables' },
        { status: 403 }
      )
    }

    // Generate a placeholder vault ref (in production, this would encrypt via WorkOS Vault)
    const vaultRef = `vault_${Date.now()}_${Math.random().toString(36).substring(7)}`

    const variableId = await convex.mutation(api.variables.create, {
      key,
      vaultRef,
      description,
      environments,
      projectId: projectId as Id<'projects'>,
      isSensitive,
      createdBy: convexUser._id,
    })

    const variable = await convex.query(api.variables.getById, { variableId })

    return NextResponse.json({ variable }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create variable'

    if (message.includes('already exists')) {
      return NextResponse.json(
        { error: 'Variable key already exists in this project' },
        { status: 409 }
      )
    }

    // Check for tier limit errors
    if (message.includes('limit reached') || message.includes('Upgrade to Pro') || message.includes('requires Pro tier')) {
      return NextResponse.json(
        { error: message, code: 'TIER_LIMIT_EXCEEDED' },
        { status: 402 } // Payment Required
      )
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
