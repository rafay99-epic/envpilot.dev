import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import type { Id } from '../../../../../convex/_generated/dataModel'
import { getOrCreateConvexUser, checkOrganizationMembership, getProjectOrganization } from '@/lib/convex-helpers'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

/**
 * GET /api/extension/variables - List variables for a project (with decrypted values)
 *
 * Requires either:
 * - A valid access token (X-Access-Token header)
 * - Or authenticated session with project access
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('projectId')
    const environment = searchParams.get('environment') || 'development'
    const accessToken = request.headers.get('X-Access-Token')

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      )
    }

    // Validate access token if provided
    if (accessToken) {
      const validation = await convex.query(api.projectAccess.validateToken, {
        accessToken,
      })

      if (!validation.valid) {
        return NextResponse.json(
          { error: validation.reason || 'Invalid access token' },
          { status: 401 }
        )
      }

      if (validation.projectId !== projectId) {
        return NextResponse.json(
          { error: 'Access token does not match project' },
          { status: 403 }
        )
      }

      // Update last used
      await convex.mutation(api.projectAccess.updateLastUsed, { accessToken })
    } else {
      // Fall back to session authentication
      const { user } = await withAuth()

      if (!user) {
        return NextResponse.json(
          { error: 'Not authenticated' },
          { status: 401 }
        )
      }

      const convexUser = await getOrCreateConvexUser(convex, user)

      // Verify project access
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
    }

    // Get variables
    const variables = await convex.query(api.variables.listByProject, {
      projectId: projectId as Id<'projects'>,
      environment,
    })

    // Decrypt values (in production, fetch from WorkOS Vault)
    // For now, we'll return placeholder values since the actual encryption
    // would require WorkOS Vault integration
    const variablesWithValues = variables.map((variable) => ({
      _id: variable._id,
      key: variable.key,
      // In production, decrypt from vault using variable.vaultRef
      value: `[ENCRYPTED:${variable.vaultRef}]`,
      description: variable.description || null,
      environments: variable.environments,
      projectId: variable.projectId,
      isSensitive: variable.isSensitive,
      version: variable.version,
    }))

    return NextResponse.json({
      data: {
        variables: variablesWithValues,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch variables'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
