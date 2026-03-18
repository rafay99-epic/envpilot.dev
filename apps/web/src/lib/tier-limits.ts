/**
 * Client-side tier limits helper
 *
 * This mirrors the tier configuration from convex/tierLimits.ts
 * for UI display purposes only. All enforcement happens server-side
 * in Convex mutations.
 */

export type Tier = "free" | "pro";

export interface TierLimits {
  maxProjects: number | null;
  maxVariablesPerProject: number | null;
  maxTeamMembers: number | null;
  maxOrganizations: number | null;
  auditLogRetentionDays: number;
  apiAccessEnabled: boolean;
  extensionAccessEnabled: boolean;
  granularPermissionsEnabled: boolean;
  variableVersionHistoryEnabled: boolean;
  bulkImportEnabled: boolean;
}

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxProjects: 3,
    maxVariablesPerProject: 50,
    maxTeamMembers: 3,
    maxOrganizations: 1,
    auditLogRetentionDays: 7,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    granularPermissionsEnabled: false,
    variableVersionHistoryEnabled: false,
    bulkImportEnabled: false,
  },
  pro: {
    maxProjects: null,
    maxVariablesPerProject: null,
    maxTeamMembers: null,
    maxOrganizations: null,
    auditLogRetentionDays: 365,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    granularPermissionsEnabled: true,
    variableVersionHistoryEnabled: true,
    bulkImportEnabled: true,
  },
};

export function isValidTier(tier: string): tier is Tier {
  return tier === "free" || tier === "pro";
}

/**
 * Get tier limits for UI display.
 * Enforcement happens server-side in Convex mutations.
 */
export function getTierLimits(tier: string): TierLimits {
  if (!isValidTier(tier)) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  return TIER_LIMITS[tier];
}

type BooleanLimitKey = {
  [K in keyof TierLimits]: TierLimits[K] extends boolean ? K : never;
}[keyof TierLimits];

/**
 * Check if a boolean feature is enabled for a tier
 */
export function checkTierLimit(
  tier: string,
  feature: BooleanLimitKey
): { allowed: boolean; message?: string } {
  if (!isValidTier(tier)) {
    return { allowed: false, message: "Invalid tier" };
  }

  const limits = TIER_LIMITS[tier];
  const isEnabled = limits[feature];

  if (isEnabled) {
    return { allowed: true };
  }

  const featureMessages: Record<BooleanLimitKey, string> = {
    apiAccessEnabled: "API access is currently disabled.",
    extensionAccessEnabled: "Extension access is currently disabled.",
    granularPermissionsEnabled: "Granular permissions are currently disabled.",
    variableVersionHistoryEnabled: "Version history is currently disabled.",
    bulkImportEnabled: "Bulk import is currently disabled.",
  };

  return {
    allowed: false,
    message: featureMessages[feature],
  };
}
