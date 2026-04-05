"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Client-side hook to check if the payment system is enabled.
 *
 * Queries the admin-controllable DB toggle (`adminSettings.paymentsEnabled`).
 * Returns `false` while loading to prevent showing upgrade UI before
 * we know the toggle state.
 */
export function usePaymentsEnabled(): boolean {
  const enabled = useQuery(api.tierLimits.isPaymentsEnabled);
  // Default to false while loading — don't show upgrade UI until we know
  return enabled ?? false;
}
