import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../../convex/_generated/api'
import { Id } from '../../../../../../convex/_generated/dataModel'
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
  checkCLIAccess,
  tierLimitResponse,
} from '@/lib/cli-auth'
import { createSecret, readSecret } from '@/lib/vault'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

interface BulkVariable {
  key: string
  value: string
  description?: string
  isSensitive?: boolean
}

/**
 * POST /api/cli/variables/bulk
 * Bulk create/update variables (for push command)
 */
export async function POST(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex)

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error)
  }

  try {
    const body = await request.json()
    const { projectId, environment, variables, mode = 'merge' } = body

    if (!projectId || !environment || !variables || !Array.isArray(variables)) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, environment, variables' },
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

    // Only admins and team leads can modify variables
    if (membership.role === 'member') {
      return forbiddenResponse('Members cannot modify variables')
    }

    // Check tier for CLI access
    const tierAccess = await checkCLIAccess(convex, project.organizationId)
    if (!tierAccess.allowed) {
      return tierLimitResponse('CLI/API access requires Pro tier')
    }

    // Get existing variables for this environment
    const existingVariables = await convex.query(api.variables.listByProject, {
      projectId: projectId as Id<'projects'>,
      environment,
    })

    const existingByKey = new Map(
      existingVariables.map((v) => [v.key, v])
    )

    let created = 0
    let updated = 0
    let deleted = 0

    // Process each variable
    for (const variable of variables as BulkVariable[]) {
      // Validate key format
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.key)) {
        continue // Skip invalid keys
      }

      const existing = existingByKey.get(variable.key)

      if (existing) {
        // Update existing variable
        // First, get the current decrypted value to compare
        const currentValue = await readSecret(existing.vaultRef)

        if (currentValue !== variable.value) {
          // Value changed, update it
          const vaultResult = await createSecret(variable.key, variable.value, {
            organizationId: project.organizationId,
            projectId: projectId,
          })
          const vaultRef = vaultResult.id

          await convex.mutation(api.variables.update, {
            variableId: existing._id,
            vaultRef,
            description: variable.description,
            isSensitive: variable.isSensitive,
            updatedBy: authResult.userId,
            changeReason: 'Updated via CLI push',
          })

          updated++
        }

        // Mark as processed
        existingByKey.delete(variable.key)
      } else {
        // Create new variable
        const vaultResult = await createSecret(variable.key, variable.value, {
          organizationId: project.organizationId,
          projectId: projectId,
        })
        const vaultRef = vaultResult.id

        await convex.mutation(api.variables.create, {
          key: variable.key,
          vaultRef,
          description: variable.description,
          environments: [environment],
          projectId: projectId as Id<'projects'>,
          isSensitive: variable.isSensitive ?? false,
          createdBy: authResult.userId,
        })

        created++
      }
    }

    // If mode is 'replace', delete variables that weren't in the push
    if (mode === 'replace') {
      for (const [_key, variable] of existingByKey) {
        await convex.mutation(api.variables.remove, {
          variableId: variable._id,
          deletedBy: authResult.userId,
        })
        deleted++
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        created,
        updated,
        deleted,
        total: variables.length,
      },
    })
  } catch (error) {
    console.error('CLI bulk variables error:', error)
    const message = error instanceof Error ? error.message : 'Failed to bulk update variables'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
