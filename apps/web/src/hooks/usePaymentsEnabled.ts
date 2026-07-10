"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Client-side hook to check if the payment system is enabled.
 *
 * Requires BOTH:
 *  - the build-time flag `NEXT_PUBLIC_PAYMENTS_ENABLED === "true"` (outer gate,
 *    mirrors the server-side check in `@/lib/polar`'s `isPaymentsEnabled`), and
 *  - the admin-controllable DB toggle (`adminSettings.paymentsEnabled`, inner gate).
 *
 * This keeps client UI from ever offering billing surfaces that the server
 * routes would reject with a 503 because the build-time flag is off.
 *
 * Returns `false` while loading to prevent showing upgrade UI before
 * we know the toggle state.
 */
export function usePaymentsEnabled(): boolean {
  const buildTimeEnabled = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
  const dbEnabled = useQuery(api.features.billing.tierLimits.isPaymentsEnabled);
  // Default to false while loading — don't show upgrade UI until we know
  return buildTimeEnabled && (dbEnabled ?? false);
}
