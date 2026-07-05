"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for dashboard projects - returns all projects accessible to the current user
 * Filters by project membership for non-admin users
 */
export function useProjects(
  organizationId: Id<"organizations"> | undefined,
  userId?: Id<"users">
) {
  const projects = useQuery(
    api.projects.listWithStats,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    organizationId && userId ? { organizationId } : "skip"
  );

  return {
    projects: projects ?? [],
    isLoading: organizationId ? projects === undefined : false,
  };
}

/**
 * Hook for dashboard variables - returns only the variables the current user
 * can access (env scope + per-variable grants applied), never leaking vault
 * refs for inaccessible variables. Requires the current Convex user id.
 */
export function useVariables(
  organizationId: Id<"organizations"> | undefined,
  userId: Id<"users"> | undefined
) {
  const variables = useQuery(
    api.variables.listOrgVariablesWithAccess,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    organizationId && userId ? { organizationId } : "skip"
  );

  return {
    variables: variables ?? [],
    isLoading: organizationId && userId ? variables === undefined : false,
  };
}

/**
 * Hook for dashboard statistics
 */
export function useDashboardStats(
  organizationId: Id<"organizations"> | undefined
) {
  const stats = useQuery(
    api.dashboard.getStats,
    organizationId ? { organizationId } : "skip"
  );

  return {
    stats: stats ?? null,
    isLoading: organizationId ? stats === undefined : false,
  };
}

/**
 * Hook for recent activity on the dashboard. Access-gated: requires the
 * current Convex user id; developers only see activity for projects they are
 * assigned to.
 */
export function useRecentActivity(
  organizationId: Id<"organizations"> | undefined,
  userId: Id<"users"> | undefined
) {
  const activity = useQuery(
    api.dashboard.getRecentActivity,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    organizationId && userId ? { organizationId } : "skip"
  );

  return {
    activity: activity ?? [],
    isLoading: organizationId && userId ? activity === undefined : false,
  };
}

/**
 * Hook for recent projects on the dashboard
 */
export function useRecentProjects(
  organizationId: Id<"organizations"> | undefined
) {
  const projects = useQuery(
    api.dashboard.getRecentProjects,
    organizationId ? { organizationId } : "skip"
  );

  return {
    projects: projects ?? [],
    isLoading: organizationId ? projects === undefined : false,
  };
}

/**
 * Hook for team members quick view
 */
export function useTeamMembersQuickView(
  organizationId: Id<"organizations"> | undefined
) {
  const members = useQuery(
    api.dashboard.getTeamMembers,
    organizationId ? { organizationId } : "skip"
  );

  return {
    members: members ?? [],
    isLoading: organizationId ? members === undefined : false,
  };
}

/**
 * Hook for dashboard analytics data
 */
export function useAnalytics(
  organizationId: Id<"organizations"> | undefined,
  daysBack?: number
) {
  const analytics = useQuery(
    api.dashboard.getAnalytics,
    organizationId ? { organizationId, daysBack } : "skip"
  );

  return {
    analytics: analytics ?? null,
    isLoading: organizationId ? analytics === undefined : false,
  };
}

/**
 * Hook for onboarding status
 */
export function useOnboardingStatus(
  organizationId: Id<"organizations"> | undefined
) {
  const status = useQuery(
    api.dashboard.getOnboardingStatus,
    organizationId ? { organizationId } : "skip"
  );

  return {
    status: status ?? null,
    isLoading: organizationId ? status === undefined : false,
  };
}
