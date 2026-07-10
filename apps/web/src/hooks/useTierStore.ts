"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useTierStore } from "@/stores/tier-store";
import { useAuth } from "@/hooks/use-auth";
import { useConvexUser } from "@/hooks/useConvexUser";

/**
 * Bridge hook that syncs Convex tier/usage data into the Zustand store.
 *
 * Use this in layout or top-level components to hydrate the store once.
 * Child components can then read from useTierStore() directly without
 * creating additional Convex WebSocket subscriptions.
 */
export function useTierStoreSync() {
  const { user, organization } = useAuth();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  const usageData = useQuery(
    api.features.billing.tierLimits.getExtendedUsage,
    orgId ? { organizationId: orgId } : "skip"
  );

  const enforcementEnabled = useQuery(
    api.features.billing.tierLimits.isEnforcementEnabled
  );

  // Hydrate user-level tier info (self, derived from the verified JWT;
  // convexUserId only gates readiness)
  const userTierInfo = useQuery(
    api.features.featureRegistry.queries.getMyTierInfo,
    convexUserId ? {} : "skip"
  );

  // Hydrate resolved features for the current org
  const resolvedFeatures = useQuery(
    api.features.featureRegistry.queries.getResolvedFeatures,
    orgId ? { organizationId: orgId } : "skip"
  );

  const {
    setUsageData,
    clearUsageData,
    setEnforcementEnabled,
    setUserTier,
    setFeatures,
    organizationId: storedOrgId,
  } = useTierStore();

  // Sync enforcement status from Convex server env var
  useEffect(() => {
    if (enforcementEnabled !== undefined) {
      setEnforcementEnabled(enforcementEnabled);
    }
  }, [enforcementEnabled, setEnforcementEnabled]);

  // Sync user-level tier info
  useEffect(() => {
    if (userTierInfo) {
      setUserTier({
        userTier: userTierInfo.tier,
        graceActive: userTierInfo.graceActive,
        gracePeriodEnd: userTierInfo.gracePeriodEnd ?? null,
      });
    }
  }, [userTierInfo, setUserTier]);

  // Sync resolved features
  useEffect(() => {
    if (resolvedFeatures?.features) {
      setFeatures(resolvedFeatures.features);
    }
  }, [resolvedFeatures, setFeatures]);

  // Sync Convex data into Zustand store
  useEffect(() => {
    if (!orgId) {
      clearUsageData();
      return;
    }

    // Organization changed — clear stale data
    if (storedOrgId && storedOrgId !== orgId) {
      clearUsageData();
    }

    if (usageData) {
      setUsageData({
        organizationId: orgId,
        tier: usageData.tier,
        usage: usageData.usage,
      });
    }
  }, [orgId, usageData, storedOrgId, setUsageData, clearUsageData]);
}

/**
 * Read-only hook to access cached tier/usage data from the Zustand store.
 * Does NOT create Convex subscriptions — purely reads from the store.
 *
 * For pre-mutation checks that need real-time accuracy, use
 * useTierLimitCheck() from useTierLimits.ts instead.
 */
export function useCachedTierData() {
  const store = useTierStore();
  return {
    isLoading: store.isLoading,
    tier: store.tier,
    usage: store.usage,
    isPro: store.tier === "pro",
    isFree: store.tier === "free",
    enforcementEnabled: store.enforcementEnabled,
    features: store.features,
    lastRefreshedAt: store.lastRefreshedAt,
  };
}
