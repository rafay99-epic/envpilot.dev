import { withAuth } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import type { AuthUser, Organization } from '@/lib/auth'
import { ROLES } from '@/lib/auth'

// GET /api/auth/me - Get current authenticated user
export async function GET() {
  try {
    const { user, organizationId, impersonator, accessToken, role } = await withAuth()

    if (!user) {
      return NextResponse.json(
        { user: null, organization: null, accessToken: null },
        { status: 401 }
      )
    }

    // Transform WorkOS user to our AuthUser type
    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      profilePictureUrl: user.profilePictureUrl ?? null,
      organizationId: organizationId ?? null,
      role: role ?? null,
      // Get permissions based on role, defaulting to member
      permissions: [...(ROLES[role as keyof typeof ROLES]?.permissions ?? ROLES.MEMBER.permissions)],
      createdAt: new Date(user.createdAt),
      updatedAt: new Date(user.updatedAt),
    }

    // If user belongs to an organization, fetch org details
    let organization: Organization | null = null
    if (organizationId) {
      // WorkOS AuthKit includes organization info in the session
      // For more detailed org info, you'd call WorkOS API
      organization = {
        id: organizationId,
        name: 'Organization', // Would be fetched from WorkOS
        slug: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    }

    return NextResponse.json({
      user: authUser,
      organization,
      accessToken,
      impersonator: impersonator
        ? { email: impersonator.email, reason: impersonator.reason ?? null }
        : undefined,
    })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}
