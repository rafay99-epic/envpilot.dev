'use client'

import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

/**
 * Hook for dashboard projects - returns all projects accessible to the current user
 * This is a simplified wrapper for dashboard UI
 */
export function useProjects() {
  const projects = useQuery(api.projects.listAll)

  return {
    projects: projects ?? [],
    isLoading: projects === undefined,
  }
}

/**
 * Hook for dashboard variables - returns all variables accessible to the current user
 * This is a simplified wrapper for dashboard UI
 */
export function useVariables() {
  const variables = useQuery(api.variables.listAll)

  return {
    variables: variables ?? [],
    isLoading: variables === undefined,
  }
}

/**
 * Hook for dashboard statistics
 */
export function useDashboardStats() {
  const stats = useQuery(api.dashboard.getStats)

  return {
    stats: stats ?? null,
    isLoading: stats === undefined,
  }
}

/**
 * Hook for recent activity on the dashboard
 */
export function useRecentActivity() {
  const activity = useQuery(api.dashboard.getRecentActivity)

  return {
    activity: activity ?? [],
    isLoading: activity === undefined,
  }
}

/**
 * Hook for recent projects on the dashboard
 */
export function useRecentProjects() {
  const projects = useQuery(api.dashboard.getRecentProjects)

  return {
    projects: projects ?? [],
    isLoading: projects === undefined,
  }
}

/**
 * Hook for team members quick view
 */
export function useTeamMembersQuickView() {
  const members = useQuery(api.dashboard.getTeamMembers)

  return {
    members: members ?? [],
    isLoading: members === undefined,
  }
}

/**
 * Hook for onboarding status
 */
export function useOnboardingStatus() {
  const status = useQuery(api.dashboard.getOnboardingStatus)

  return {
    status: status ?? null,
    isLoading: status === undefined,
  }
}
