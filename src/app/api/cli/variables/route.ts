import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
  checkCLIAccess,
  tierLimitResponse,
} from '@/lib/cli-auth'
import { createSecret, readSecret } from '@/lib/vault'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * GET /api/cli/variables
 * List variables in a project (with decrypted values)
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex)

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error)
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const environment = url.searchParams.get('environment')

  if (!projectId) {
    return NextResponse.json(
      { error: 'Missing projectId parameter' },
      { status: 400 }
    )
  }

  try {
    // Get project to find organization
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<'projects'>,
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    })

    if (!membership) {
      return forbiddenResponse('You are not a member of this organization')
    }

    // Check tier for CLI access
    const tierAccess = await checkCLIAccess(convex, project.organizationId)
    if (!tierAccess.allowed) {
      return tierLimitResponse('CLI/API access requires Pro tier')
    }

    // Get variables with access info
    const variables = await convex.query(api.variables.listWithAccess, {
      projectId: projectId as Id<'projects'>,
      userId: authResult.userId,
    })

    // Decrypt values for accessible variables
    const variablesWithValues = await Promise.all(
      variables
        .filter((v) => v.hasAccess)
        .filter((v) => !environment || v.environments.includes(environment))
        .map(async (variable) => {
          try {
            // Decrypt the value from vault
            const value = await readSecret(variable.vaultRef)

            return {
              _id: variable._id,
              key: variable.key,
              value: value || '',
              environment: variable.environments,
              description: variable.description,
              isSensitive: variable.isSensitive,
              version: variable.version,
              createdAt: variable.createdAt,
              updatedAt: variable.updatedAt,
            }
          } catch (error) {
            // If decryption fails, return without value
            return {
              _id: variable._id,
              key: variable.key,
              value: '[DECRYPTION_FAILED]',
              environment: variable.environments,
              description: variable.description,
              isSensitive: variable.isSensitive,
              version: variable.version,
              createdAt: variable.createdAt,
              updatedAt: variable.updatedAt,
            }
          }
        })
    )

    return NextResponse.json({
      success: true,
      data: variablesWithValues,
      meta: {
        total: variablesWithValues.length,
        environment: environment || 'all',
      },
    })
  } catch (error) {
    console.error('CLI variables error:', error)
    return NextResponse.json(
      { error: 'Failed to list variables' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cli/variables
 * Create a new variable
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex)

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error)
  }

  try {
    const body = await request.json()
    const { projectId, key, value, environment, description, isSensitive } = body

    if (!projectId || !key || value === undefined || !environment) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, key, value, environment' },
        { status: 400 }
      )
    }

    // Validate key format
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return NextResponse.json(
        { error: 'Invalid key format. Must start with letter/underscore and contain only alphanumeric/underscores.' },
        { status: 400 }
      )
    }

    // Get project to find organization
    const project = await convex.query(api.projects.getById, {
      projectId: projectId as Id<'projects'>,
    })

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check membership and role
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: project.organizationId,
      userId: authResult.userId,
    })

    if (!membership) {
      return forbiddenResponse('You are not a member of this organization')
    }

    // Only admins and team leads can create variables
    if (membership.role === 'member') {
      return forbiddenResponse('Members cannot create variables')
    }

    // Check tier for CLI access
    const tierAccess = await checkCLIAccess(convex, project.organizationId)
    if (!tierAccess.allowed) {
      return tierLimitResponse('CLI/API access requires Pro tier')
    }

    // Store value in vault
    const vaultResult = await createSecret(key, value, {
      organizationId: project.organizationId,
      projectId: projectId,
    })
    const vaultRef = vaultResult.id

    // Create variable
    const variableId = await convex.mutation(api.variables.create, {
      key,
      vaultRef,
      description,
      environments: Array.isArray(environment) ? environment : [environment],
      projectId: projectId as Id<'projects'>,
      isSensitive: isSensitive ?? false,
      createdBy: authResult.userId,
    })

    return NextResponse.json({
      success: true,
      data: { _id: variableId },
    })
  } catch (error) {
    console.error('CLI create variable error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create variable'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
