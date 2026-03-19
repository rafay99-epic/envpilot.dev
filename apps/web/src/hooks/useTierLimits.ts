"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Tier types matching the backend
 */
/** Tier name — dynamic, not limited to "free" | "pro" */
export type Tier = string;

export type TierAction =
  | "create_project"
  | "create_variable"
  | "add_team_member"
  | "use_api"
  | "use_extension"
  | "use_granular_permissions"
  | "view_version_history"
  | "bulk_import";

/**
 * Hook to check if tier enforcement is enabled (reads from Convex server env var)
 */
export function useEnforcementEnabled(): boolean {
  const data = useQuery(api.tierLimits.isEnforcementEnabled);
  return data ?? true; // Default to enforcing while loading
}

/**
 * Hook to check if a specific action is allowed based on tier limits
 */
export function useTierLimitCheck(
  organizationId: Id<"organizations"> | undefined,
  action: TierAction,
  projectId?: Id<"projects">
) {
  const data = useQuery(
    api.tierLimits.checkTierLimit,
    organizationId
      ? {
          organizationId,
          action,
          projectId,
        }
      : "skip"
  );

  const result = data as
    | { allowed: boolean; reason?: string; tierName?: string; current?: number; limit?: number | null }
    | undefined;

  return {
    isLoading: data === undefined,
    allowed: result?.allowed ?? false,
    reason: result?.reason,
    current: result?.current,
    limit: result?.limit,
  };
}

// ==========================================
// UTILITY FUNCTIONS (not hooks)
// ==========================================

/**
 * Get a user-friendly description of limit usage
 *
 * Note: This is a utility function, not a hook.
 * The "use" prefix is kept for backwards compatibility with exports.
 */
export function useLimitDescription(
  current: number,
  limit: number | null,
  itemName: string
): string {
  return getLimitDescription(current, limit, itemName);
}

/**
 * Get a user-friendly description of limit usage
 */
export function getLimitDescription(
  current: number,
  limit: number | null,
  itemName: string
): string {
  if (limit === null) {
    return `Unlimited ${itemName}`;
  }
  const remaining = limit - current;
  if (remaining <= 0) {
    return `${itemName} limit reached (${current}/${limit})`;
  }
  return `${current}/${limit} ${itemName} used`;
}

/**
 * Calculate percentage of limit used
 *
 * Note: This is a utility function, not a hook.
 * The "use" prefix is kept for backwards compatibility with exports.
 */
export function useLimitPercentage(
  current: number,
  limit: number | null
): number {
  return calculateLimitPercentage(current, limit);
}

/**
 * Calculate percentage of limit used
 */
export function calculateLimitPercentage(
  current: number,
  limit: number | null
): number {
  if (limit === null) {
    return 0;
  }
  return Math.min(100, Math.round((current / limit) * 100));
}
