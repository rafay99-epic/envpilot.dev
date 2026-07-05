"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface FeatureGateResult {
  isLoading: boolean;
  allowed: boolean;
  value: boolean | number | null;
  current?: number;
  limit?: number | null;
  reason?: string;
  tierName?: string;
}

/**
 * Universal hook to check if a feature is allowed for an organization.
 * Resolves through: org -> org owner -> owner's user tier -> feature registry.
 *
 * @example
 * const { allowed } = useFeatureGate(orgId, "cli_access");
 * const { allowed, current, limit } = useFeatureGate(orgId, "max_projects", { currentCount: 5 });
 */
export function useFeatureGate(
  organizationId: Id<"organizations"> | undefined,
  featureKey: string,
  options?: { currentCount?: number }
): FeatureGateResult {
  const data = useQuery(
    api.featureRegistry.checkFeature,
    organizationId
      ? {
          organizationId,
          featureKey,
          currentCount: options?.currentCount,
        }
      : "skip"
  );

  const result = data as
    | {
        allowed: boolean;
        value: boolean | number | null;
        tierName: string;
        reason?: string;
        current?: number;
        limit?: number | null;
      }
    | undefined;

  return {
    isLoading: data === undefined,
    allowed: result?.allowed ?? false,
    value: result?.value ?? null,
    current: result?.current,
    limit: result?.limit,
    reason: result?.reason,
    tierName: result?.tierName,
  };
}

/**
 * Hook to get the current user's tier, grace period status, and tier
 * definition. The user is derived server-side from the verified JWT; the
 * `userId` param remains only as a readiness gate (skip until the Convex
 * user is known).
 */
export function useUserTier(userId: Id<"users"> | undefined) {
  const data = useQuery(
    api.featureRegistry.getMyTierInfo,
    userId ? {} : "skip"
  );

  return {
    isLoading: data === undefined,
    tier: data?.tier,
    tierDefinition: data?.tierDefinition,
    graceActive: data?.graceActive ?? false,
    gracePeriodEnd: data?.gracePeriodEnd,
  };
}

/**
 * Hook to get all resolved features for an organization (bulk check).
 * Returns a features map and helper functions.
 */
export function useAllFeatures(
  organizationId: Id<"organizations"> | undefined
) {
  const data = useQuery(
    api.featureRegistry.getResolvedFeatures,
    organizationId ? { organizationId } : "skip"
  );

  return {
    isLoading: data === undefined,
    tierName: data?.tierName,
    features: data?.features ?? {},
    isAllowed: (key: string) => {
      const f = data?.features?.[key];
      if (!f) return true; // Unknown features default to allowed
      if (typeof f.value === "boolean") return f.value;
      return true; // Numeric features are "allowed" (limit checked separately)
    },
    getLimit: (key: string): number | null | undefined => {
      const f = data?.features?.[key];
      if (!f || typeof f.value === "boolean") return undefined;
      return f.value;
    },
  };
}
