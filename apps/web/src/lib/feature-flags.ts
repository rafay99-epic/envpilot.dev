/**
 * Feature Flags Configuration
 *
 * Centralized feature flag management for enabling/disabling features.
 * Features can be toggled via environment variables.
 *
 * NOTE: API_ACCESS and EXTENSION flags have been removed — they are now
 * tier-gated dynamically via the feature registry (api_access, extension_access).
 */

/**
 * Available feature flags
 */
export const FEATURE_FLAGS = {
  /**
   * Payment System (Polar.sh Integration)
   * When enabled, users can upgrade via Polar checkout.
   * Set NEXT_PUBLIC_PAYMENTS_ENABLED=true to enable.
   */
  PAYMENTS: "payments",
} as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  switch (flag) {
    case FEATURE_FLAGS.PAYMENTS:
      return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";

    default:
      return false;
  }
}

/**
 * Client-safe feature flags (only includes NEXT_PUBLIC_ variables)
 * These can be safely exposed to the browser
 */
export function getClientFeatureFlags(): Record<string, boolean> {
  return {
    payments: isFeatureEnabled(FEATURE_FLAGS.PAYMENTS),
  };
}
