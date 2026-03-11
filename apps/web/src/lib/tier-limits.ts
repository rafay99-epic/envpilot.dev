/**
 * Client-side tier limits helper
 *
 * This mirrors the tier configuration from convex/tierLimits.ts
 * for use in API routes and client-side code.
 *
 * Enforcement is controlled by NEXT_PUBLIC_ENFORCE_TIER_LIMITS env var.
 * When disabled (default), the UI shows tier info but no actions are blocked.
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

/**
 * Unlimited tier config used when enforcement is disabled (pre-alpha mode).
 */
const UNLIMITED_LIMITS: TierLimits = {
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
};

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

/**
 * Check if tier limit enforcement is enabled
 */
export function isTierEnforcementEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENFORCE_TIER_LIMITS === "true";
}

export function isValidTier(tier: string): tier is Tier {
  return tier === "free" || tier === "pro";
}

/**
 * Get tier limits with validation.
 * When enforce is false (pre-alpha mode), returns unlimited config for all tiers.
 */
export function getTierLimits(
  tier: string,
  enforce?: boolean
): TierLimits {
  if (!isValidTier(tier)) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  const shouldEnforce = enforce ?? isTierEnforcementEnabled();
  if (!shouldEnforce) {
    return UNLIMITED_LIMITS;
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
