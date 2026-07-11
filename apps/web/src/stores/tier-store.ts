import { create } from "zustand";

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
  /** Number of currently active secret sharing links */
  activeShares?: number;
  /** Number of variables with rotation enabled */
  rotationEnabledVars?: number;
  /** Number of shared accounts (service login credentials) across the org */
  sharedAccounts?: number;
}

/** Resolved feature value from the dynamic feature registry */
export interface ResolvedFeature {
  value: boolean | number | null;
  valueType: string;
  displayName: string;
  category: string;
}

interface TierState {
  organizationId: string | null;
  tier: string | null;
  usage: TierUsage | null;
  isLoading: boolean;
  lastRefreshedAt: number | null;
  enforcementEnabled: boolean;
  // New: user-level tier info
  userTier: string | null;
  graceActive: boolean;
  gracePeriodEnd: number | null;
  // New: dynamic features from feature registry
  features: Record<string, ResolvedFeature>;
  /** Which org the `features` map was resolved for (store-backed gates
   *  must not serve another org's values) */
  featuresOrgId: string | null;
  /** Effective tier name the `features` map was resolved against */
  featuresTierName: string | null;
}

interface TierActions {
  setUsageData: (data: {
    organizationId: string;
    tier: string;
    usage: TierUsage;
  }) => void;
  clearUsageData: () => void;
  setEnforcementEnabled: (enabled: boolean) => void;
  setUserTier: (data: {
    userTier: string;
    graceActive: boolean;
    gracePeriodEnd: number | null;
  }) => void;
  setFeatures: (data: {
    organizationId: string;
    tierName: string;
    features: Record<string, ResolvedFeature>;
  }) => void;
}

export type TierStore = TierState & TierActions;

export const useTierStore = create<TierStore>((set) => ({
  organizationId: null,
  tier: null,
  usage: null,
  isLoading: true,
  lastRefreshedAt: null,
  enforcementEnabled: true,
  userTier: null,
  graceActive: false,
  gracePeriodEnd: null,
  features: {},
  featuresOrgId: null,
  featuresTierName: null,

  setUsageData: (data) =>
    set({
      organizationId: data.organizationId,
      tier: data.tier,
      usage: data.usage,
      isLoading: false,
      lastRefreshedAt: Date.now(),
    }),

  clearUsageData: () =>
    set({
      organizationId: null,
      tier: null,
      usage: null,
      isLoading: true,
      lastRefreshedAt: null,
      userTier: null,
      graceActive: false,
      gracePeriodEnd: null,
      features: {},
      featuresOrgId: null,
      featuresTierName: null,
    }),

  setEnforcementEnabled: (enabled) => set({ enforcementEnabled: enabled }),

  setUserTier: (data) =>
    set({
      userTier: data.userTier,
      graceActive: data.graceActive,
      gracePeriodEnd: data.gracePeriodEnd,
    }),

  setFeatures: (data) =>
    set({
      features: data.features,
      featuresOrgId: data.organizationId,
      featuresTierName: data.tierName,
    }),
}));
