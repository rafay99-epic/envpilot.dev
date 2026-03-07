import type { MembershipRole } from '@/lib/auth'

export const ACTIVE_ORG_COOKIE_NAME = 'env_connect_active_org'
export const ACTIVE_ORG_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 365

export interface OrganizationWithMembershipRole {
  _id: string
  name: string
  slug: string
  tier: 'free' | 'pro'
  role: MembershipRole
  createdAt: number
  updatedAt: number
}

/**
 * Select active organization using a preferred ID (e.g., cookie value).
 * Falls back to the first available org if preferred one is not accessible.
 */
export function selectActiveOrganization(
  organizations: OrganizationWithMembershipRole[],
  preferredOrgId?: string | null
): OrganizationWithMembershipRole | null {
  if (organizations.length === 0) {
    return null
  }

  if (preferredOrgId) {
    const preferred = organizations.find((org) => org._id === preferredOrgId)
    if (preferred) {
      return preferred
    }
  }

  return organizations[0]
}

/**
 * Client-side helper to persist active organization selection.
 */
export function setActiveOrganizationCookie(orgId: string) {
  if (typeof document === 'undefined') {
    return
  }

  document.cookie = `${ACTIVE_ORG_COOKIE_NAME}=${encodeURIComponent(orgId)}; path=/; max-age=${ACTIVE_ORG_COOKIE_TTL_SECONDS}; samesite=lax`
}
