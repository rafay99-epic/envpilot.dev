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

  // Org switch / sign-out — clear stale usage snapshot. The usage numbers
  // themselves are populated ONLY by useExtendedUsageSync (mounted on the
  // usage page), never here: getExtendedUsage scans up to ~2000 variable
  // docs plus per-project share/rotation/account counts, and as a reactive
  // subscription it re-ran on EVERY variable write in the org. Keeping it
  // out of this app-wide sync hook is what keeps dashboard writes cheap.
  useEffect(() => {
    if (!orgId || (storedOrgId && storedOrgId !== orgId)) {
      clearUsageData();
    }
  }, [orgId, storedOrgId, clearUsageData]);
}

/**
 * Heavyweight usage sync — mount ONLY on surfaces that display usage
 * numbers (the /dashboard/usage page). See the comment in useTierStoreSync
 * for why this must never ride along in the global layout/nav.
 */
export function useExtendedUsageSync() {
  const { organization } = useAuth();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const usageData = useQuery(
    api.features.billing.tierLimits.getExtendedUsage,
    orgId ? { organizationId: orgId } : "skip"
  );

  const { setUsageData } = useTierStore();

  useEffect(() => {
    if (orgId && usageData) {
      setUsageData({
        organizationId: orgId,
        tier: usageData.tier,
        usage: usageData.usage,
      });
    }
  }, [orgId, usageData, setUsageData]);
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
