/**
 * Client-side tier limits helper
 *
 * This mirrors the tier configuration from convex/tierLimits.ts
 * for use in API routes and client-side code.
 */

export type Tier = 'free' | 'pro'

export interface TierLimits {
  maxProjects: number | null
  maxVariablesPerProject: number | null
  maxTeamMembers: number | null
  maxOrganizations: number | null
  auditLogRetentionDays: number
  apiAccessEnabled: boolean
  extensionAccessEnabled: boolean
  granularPermissionsEnabled: boolean
  variableVersionHistoryEnabled: boolean
  bulkImportEnabled: boolean
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxProjects: 5,
    maxVariablesPerProject: 20,
    maxTeamMembers: 5,
    maxOrganizations: 2,
    auditLogRetentionDays: 7,
    apiAccessEnabled: false,
    extensionAccessEnabled: false,
    granularPermissionsEnabled: true,
    variableVersionHistoryEnabled: false,
    bulkImportEnabled: false,
  },
  pro: {
    maxProjects: null,
    maxVariablesPerProject: null,
    maxTeamMembers: null,
    maxOrganizations: null,
    auditLogRetentionDays: 730,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    granularPermissionsEnabled: true,
    variableVersionHistoryEnabled: true,
    bulkImportEnabled: true,
  },
}

export function isValidTier(tier: string): tier is Tier {
  return tier === 'free' || tier === 'pro'
}

export function getTierLimits(tier: string): TierLimits {
  if (!isValidTier(tier)) {
    throw new Error(`Invalid tier: ${tier}`)
  }
  return TIER_LIMITS[tier]
}

type BooleanLimitKey = {
  [K in keyof TierLimits]: TierLimits[K] extends boolean ? K : never
}[keyof TierLimits]

/**
 * Check if a boolean feature is enabled for a tier
 */
export function checkTierLimit(
  tier: string,
  feature: BooleanLimitKey
): { allowed: boolean; message?: string } {
  if (!isValidTier(tier)) {
    return { allowed: false, message: 'Invalid tier' }
  }

  const limits = TIER_LIMITS[tier]
  const isEnabled = limits[feature]

  if (isEnabled) {
    return { allowed: true }
  }

  const featureMessages: Record<BooleanLimitKey, string> = {
    apiAccessEnabled: 'API access requires Pro tier. Upgrade to unlock API access.',
    extensionAccessEnabled: 'Extension access requires Pro tier. Upgrade to unlock VS Code/IDE extension.',
    granularPermissionsEnabled: 'Granular permissions require Pro tier.',
    variableVersionHistoryEnabled: 'Version history requires Pro tier.',
    bulkImportEnabled: 'Bulk import requires Pro tier.',
  }

  return {
    allowed: false,
    message: featureMessages[feature],
  }
}
