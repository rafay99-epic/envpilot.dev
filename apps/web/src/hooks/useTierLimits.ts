"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Tier types matching the backend
 */
export type Tier = "free" | "pro";

export interface TierLimits {
  maxProjects: number | null;
  maxVariablesPerProject: number | null;
  maxTeamMembers: number | null;
  maxOrganizations: number | null;
  auditLogRetentionDays: number;
  apiAccessEnabled: boolean;
  extensionAccessEnabled: boolean;
  granularPermissionsEnabled: boolean;
  variableVersionHistoryEnabled: boolean;
  bulkImportEnabled: boolean;
}

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
 * Hook to get organization tier limits and current usage
 */
export function useOrganizationTierLimits(
  organizationId: Id<"organizations"> | undefined
) {
  const limitsData = useQuery(
    api.tierLimits.getOrganizationLimits,
    organizationId ? { organizationId } : "skip"
  );

  const usageData = useQuery(
    api.tierLimits.getOrganizationUsage,
    organizationId ? { organizationId } : "skip"
  );

  return {
    isLoading: limitsData === undefined || usageData === undefined,
    tier: limitsData?.tier as Tier | undefined,
    limits: limitsData?.limits as TierLimits | undefined,
    usage: usageData?.usage,
    isPro: limitsData?.tier === "pro",
    isFree: limitsData?.tier === "free",
  };
}

/**
 * Hook to get project variable count and limits
 */
export function useProjectVariableLimits(
  projectId: Id<"projects"> | undefined
) {
  const data = useQuery(
    api.tierLimits.getProjectVariableCount,
    projectId ? { projectId } : "skip"
  );

  if (!data) {
    return {
      isLoading: true,
      tier: undefined,
      limits: undefined,
      usage: undefined,
      canCreateVariable: false,
      variablesRemaining: 0,
    };
  }

  const canCreateVariable =
    data.limits.maxVariablesPerProject === null ||
    data.usage.variables < data.limits.maxVariablesPerProject;

  const variablesRemaining =
    data.limits.maxVariablesPerProject === null
      ? Infinity
      : Math.max(0, data.limits.maxVariablesPerProject - data.usage.variables);

  return {
    isLoading: false,
    tier: data.tier as Tier,
    limits: data.limits as TierLimits,
    usage: data.usage,
    canCreateVariable,
    variablesRemaining,
  };
}

/**
 * Hook to get user's organization limits
 */
export function useUserOrganizationLimits(userId: Id<"users"> | undefined) {
  const data = useQuery(
    api.tierLimits.getUserOrganizationCount,
    userId ? { userId } : "skip"
  );

  if (!data) {
    return {
      isLoading: true,
      effectiveTier: undefined,
      limits: undefined,
      usage: undefined,
      canCreateOrganization: false,
      organizationsRemaining: 0,
    };
  }

  const canCreateOrganization =
    data.limits.maxOrganizations === null ||
    data.usage.ownedOrganizations < data.limits.maxOrganizations;

  const organizationsRemaining =
    data.limits.maxOrganizations === null
      ? Infinity
      : Math.max(
          0,
          data.limits.maxOrganizations - data.usage.ownedOrganizations
        );

  return {
    isLoading: false,
    effectiveTier: data.effectiveTier as Tier,
    limits: data.limits as TierLimits,
    usage: data.usage,
    canCreateOrganization,
    organizationsRemaining,
  };
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

  return {
    isLoading: data === undefined,
    allowed: data?.allowed ?? false,
    reason: data?.reason,
    current: data?.current,
    limit: data?.limit,
  };
}

/**
 * Helper hook to check multiple features at once
 */
export function useTierFeatures(
  organizationId: Id<"organizations"> | undefined
) {
  const { tier, limits, isLoading } = useOrganizationTierLimits(organizationId);

  return {
    isLoading,
    tier,
    isPro: tier === "pro",
    isFree: tier === "free",
    features: {
      apiAccess: limits?.apiAccessEnabled ?? false,
      extensionAccess: limits?.extensionAccessEnabled ?? false,
      granularPermissions: limits?.granularPermissionsEnabled ?? false,
      versionHistory: limits?.variableVersionHistoryEnabled ?? false,
      bulkImport: limits?.bulkImportEnabled ?? false,
    },
    limits: {
      maxProjects: limits?.maxProjects ?? null,
      maxVariablesPerProject: limits?.maxVariablesPerProject ?? null,
      maxTeamMembers: limits?.maxTeamMembers ?? null,
      maxOrganizations: limits?.maxOrganizations ?? null,
      auditLogRetentionDays: limits?.auditLogRetentionDays ?? 7,
    },
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
