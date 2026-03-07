import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import {
  authenticateCLIRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/cli-auth'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

// Tier limits matching convex/tierLimits.ts
const TIER_LIMITS = {
  free: {
    maxProjects: null,
    maxVariablesPerProject: null,
    maxTeamMembers: null,
    maxOrganizations: null,
    auditLogRetentionDays: 730,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    versionHistoryEnabled: true,
    bulkImportEnabled: true,
  },
  pro: {
    maxProjects: null,
    maxVariablesPerProject: null,
    maxTeamMembers: null,
    maxOrganizations: null,
    auditLogRetentionDays: 730,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    versionHistoryEnabled: true,
    bulkImportEnabled: true,
  },
}

/**
 * GET /api/cli/tier
 * Get tier information for an organization
 */
export async function GET(request: NextRequest) {
  // Authenticate
  const authResult = await authenticateCLIRequest(request, convex)

  if (!authResult.valid || !authResult.userId) {
    return unauthorizedResponse(authResult.error)
  }

  const url = new URL(request.url)
  const organizationId = url.searchParams.get('organizationId')

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Missing organizationId parameter' },
      { status: 400 }
    )
  }

  try {
    // Check membership
    const membership = await convex.query(api.organizations.getMembership, {
      organizationId: organizationId as Id<'organizations'>,
      userId: authResult.userId,
    })

    if (!membership) {
      return forbiddenResponse('You are not a member of this organization')
    }

    // Get organization
    const org = await convex.query(api.organizations.getById, {
      organizationId: organizationId as Id<'organizations'>,
    })

    if (!org) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    const limits = TIER_LIMITS[org.tier]

    return NextResponse.json({
      tier: org.tier,
      apiAccessEnabled: limits.apiAccessEnabled,
      limits: {
        projects: limits.maxProjects,
        variablesPerProject: limits.maxVariablesPerProject,
        teamMembers: limits.maxTeamMembers,
      },
      features: {
        versionHistory: limits.versionHistoryEnabled,
        bulkImport: limits.bulkImportEnabled,
        extensionAccess: limits.extensionAccessEnabled,
        auditLogRetentionDays: limits.auditLogRetentionDays,
      },
    })
  } catch (error) {
    console.error('CLI tier error:', error)
    return NextResponse.json(
      { error: 'Failed to get tier information' },
      { status: 500 }
    )
  }
}
