"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { useTierStore } from "@/stores/tier-store";
import { useAuth } from "@/hooks/use-auth";
import { getTierLimits } from "@/lib/tier-limits";

/**
 * Bridge hook that syncs Convex tier/usage data into the Zustand store.
 *
 * Use this in layout or top-level components to hydrate the store once.
 * Child components can then read from useTierStore() directly without
 * creating additional Convex WebSocket subscriptions.
 */
export function useTierStoreSync() {
  const { organization } = useAuth();
  const orgId = organization?.id as Id<"organizations"> | undefined;

  const usageData = useQuery(
    api.tierLimits.getOrganizationUsage,
    orgId ? { organizationId: orgId } : "skip"
  );

  const enforcementEnabled = useQuery(api.tierLimits.isEnforcementEnabled);

  const {
    setUsageData,
    clearUsageData,
    setEnforcementEnabled,
    organizationId: storedOrgId,
  } = useTierStore();

  // Sync enforcement status from Convex server env var
  useEffect(() => {
    if (enforcementEnabled !== undefined) {
      setEnforcementEnabled(enforcementEnabled);
    }
  }, [enforcementEnabled, setEnforcementEnabled]);

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
        limits: usageData.limits ?? getTierLimits(usageData.tier),
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
    limits: store.limits,
    usage: store.usage,
    isPro: store.tier === "pro",
    isFree: store.tier === "free",
    enforcementEnabled: store.enforcementEnabled,
    lastRefreshedAt: store.lastRefreshedAt,
  };
}
