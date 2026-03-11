/**
 * Feature Flags Configuration
 *
 * Centralized feature flag management for enabling/disabling features.
 * Features can be toggled via environment variables.
 */

/**
 * Available feature flags
 */
export const FEATURE_FLAGS = {
  /**
   * Payment System (Stripe Integration)
   * When enabled, users can upgrade to Pro tier via Stripe checkout.
   * Set NEXT_PUBLIC_PAYMENTS_ENABLED=true to enable.
   */
  PAYMENTS: "payments",

  /**
   * API Access (for Pro tier)
   * Allows organizations to generate API keys for programmatic access.
   */
  API_ACCESS: "api_access",

  /**
   * VS Code Extension Integration
   * Allows linking VS Code extension for syncing env variables.
   */
  EXTENSION: "extension",

  /**
   * Tier Limit Enforcement
   * When enabled, Free tier limits are enforced (project, variable, member caps).
   * When disabled (default), all limits are bypassed (pre-alpha mode).
   * Set NEXT_PUBLIC_ENFORCE_TIER_LIMITS=true to enable.
   */
  TIER_LIMITS: "tier_limits",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  switch (flag) {
    case FEATURE_FLAGS.PAYMENTS:
      return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    case FEATURE_FLAGS.API_ACCESS:
      // API access is always available (gated by tier, not feature flag)
      return true;

    case FEATURE_FLAGS.EXTENSION:
      // Extension is always available (gated by tier, not feature flag)
      return true;

    case FEATURE_FLAGS.TIER_LIMITS:
      return process.env.NEXT_PUBLIC_ENFORCE_TIER_LIMITS === "true";

    default:
      return false;
  }
}

/**
 * Get all feature flag states
 */
export function getFeatureFlagStates(): Record<FeatureFlag, boolean> {
  return {
    [FEATURE_FLAGS.PAYMENTS]: isFeatureEnabled(FEATURE_FLAGS.PAYMENTS),
    [FEATURE_FLAGS.API_ACCESS]: isFeatureEnabled(FEATURE_FLAGS.API_ACCESS),
    [FEATURE_FLAGS.EXTENSION]: isFeatureEnabled(FEATURE_FLAGS.EXTENSION),
    [FEATURE_FLAGS.TIER_LIMITS]: isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS),
  };
}

/**
 * Client-safe feature flags (only includes NEXT_PUBLIC_ variables)
 * These can be safely exposed to the browser
 */
export function getClientFeatureFlags(): Record<string, boolean> {
  return {
    payments: isFeatureEnabled(FEATURE_FLAGS.PAYMENTS),
    tierLimits: isFeatureEnabled(FEATURE_FLAGS.TIER_LIMITS),
  };
}
