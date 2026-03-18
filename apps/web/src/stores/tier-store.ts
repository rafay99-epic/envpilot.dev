import { create } from "zustand";
import type { Tier, TierLimits } from "@/lib/tier-limits";

export interface ProjectVariableCount {
  projectId: string;
  projectName: string;
  count: number;
}

export interface TierUsage {
  projects: number;
  teamMembers: number;
  pendingInvitations: number;
  totalVariables: number;
  maxVariablesInProject: number;
  maxVariablesProjectName: string;
  variablesPerProject: ProjectVariableCount[];
}

interface TierState {
  organizationId: string | null;
  tier: Tier | null;
  limits: TierLimits | null;
  usage: TierUsage | null;
  isLoading: boolean;
  lastRefreshedAt: number | null;
  enforcementEnabled: boolean;
}

interface TierActions {
  setUsageData: (data: {
    organizationId: string;
    tier: Tier;
    limits: TierLimits;
    usage: TierUsage;
  }) => void;
  clearUsageData: () => void;
  setEnforcementEnabled: (enabled: boolean) => void;
}

export type TierStore = TierState & TierActions;

export const useTierStore = create<TierStore>((set) => ({
  organizationId: null,
  tier: null,
  limits: null,
  usage: null,
  isLoading: true,
  lastRefreshedAt: null,
  // Defaults to true; hydrated from server via api.tierLimits.isEnforcementEnabled
  enforcementEnabled: true,

  setUsageData: (data) =>
    set({
      organizationId: data.organizationId,
      tier: data.tier,
      limits: data.limits,
      usage: data.usage,
      isLoading: false,
      lastRefreshedAt: Date.now(),
    }),

  clearUsageData: () =>
    set({
      organizationId: null,
      tier: null,
      limits: null,
      usage: null,
      isLoading: true,
      lastRefreshedAt: null,
    }),

  setEnforcementEnabled: (enabled) => set({ enforcementEnabled: enabled }),
}));
