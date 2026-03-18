/**
 * Client-side tier limits helper
 *
 * This mirrors the tier configuration from convex/tierLimits.ts
 * for UI display purposes only. All enforcement happens server-side
 * in Convex mutations.
 *
 * Tier names are dynamic (stored in DB), but we keep seed defaults
 * here for client-side fallback display when DB data hasn't loaded.
 */

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

/**
 * Seed defaults for client-side fallback display.
 * The actual tier definitions come from the tierDefinitions table via Convex queries.
 */
export const SEED_TIER_DEFAULTS: Record<string, TierLimits> = {
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

/**
 * @deprecated Use SEED_TIER_DEFAULTS instead. Kept for backward compatibility.
 */
export const TIER_LIMITS = SEED_TIER_DEFAULTS;

/**
 * Get tier limits for UI display (fallback to seed defaults).
 * Enforcement happens server-side in Convex mutations.
 */
export function getTierLimits(tier: string): TierLimits {
  if (tier in SEED_TIER_DEFAULTS) {
    return SEED_TIER_DEFAULTS[tier];
  }
  // Unknown tier — return unlimited as safe default
  return {
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
  };
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
  const limits = getTierLimits(tier);
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
