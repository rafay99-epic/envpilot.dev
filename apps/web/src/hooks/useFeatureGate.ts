"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useTierStore } from "@/stores/tier-store";

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
 * For the ACTIVE org this computes from the tier store's resolved-features
 * map — hydrated by useTierStoreSync's single global getResolvedFeatures
 * subscription — instead of opening a separate per-feature-key checkFeature
 * subscription (a typical page held 2–5 of those, each re-executing the
 * full org→owner→tier chain on any org write). The semantics mirror
 * checkFeature exactly, including deny-by-default for keys missing from
 * the resolved map. A live checkFeature subscription remains only for the
 * rare caller checking a NON-active org (or before the store hydrates).
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
  const features = useTierStore((s) => s.features);
  const featuresOrgId = useTierStore((s) => s.featuresOrgId);
  const featuresTierName = useTierStore((s) => s.featuresTierName);

  const storeHit =
    organizationId !== undefined && featuresOrgId === organizationId;

  const data = useQuery(
    api.features.featureRegistry.queries.checkFeature,
    organizationId && !storeHit
      ? {
          organizationId,
          featureKey,
          currentCount: options?.currentCount,
        }
      : "skip"
  );

  if (storeHit) {
    const tierName = featuresTierName ?? undefined;
    const f = features[featureKey];

    // Unknown or inactive feature — deny by default (matches checkFeature)
    if (!f) {
      return {
        isLoading: false,
        allowed: false,
        value: null,
        tierName: "unknown",
      };
    }

    if (f.valueType === "boolean") {
      const allowed = f.value === true;
      return {
        isLoading: false,
        allowed,
        value: allowed,
        tierName,
        reason: allowed
          ? undefined
          : `${featureKey.replace(/_/g, " ")} requires a higher tier.`,
      };
    }

    // Numeric feature
    const limit = f.value as number | null;
    if (options?.currentCount !== undefined) {
      if (limit === null) {
        // Unlimited
        return {
          isLoading: false,
          allowed: true,
          value: null,
          current: options.currentCount,
          limit: null,
          tierName,
        };
      }
      const allowed = options.currentCount < limit;
      return {
        isLoading: false,
        allowed,
        value: limit,
        current: options.currentCount,
        limit,
        tierName,
        reason: allowed
          ? undefined
          : `Limit reached (${options.currentCount}/${limit}). Upgrade your tier for more.`,
      };
    }

    // Numeric without a count — just expose the limit value
    return { isLoading: false, allowed: true, value: limit, tierName };
  }

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
    api.features.featureRegistry.queries.getMyTierInfo,
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
    api.features.featureRegistry.queries.getResolvedFeatures,
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
