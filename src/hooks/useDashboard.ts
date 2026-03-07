'use client'

import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { Id } from '../../convex/_generated/dataModel'

/**
 * Hook for dashboard projects - returns all projects accessible to the current user
 * This is a simplified wrapper for dashboard UI
 */
export function useProjects(organizationId: Id<'organizations'> | undefined) {
  const projects = useQuery(
    api.projects.listWithStats,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    projects: projects ?? [],
    isLoading: organizationId ? projects === undefined : false,
  }
}

/**
 * Hook for dashboard variables - returns all variables accessible to the current user
 * This is a simplified wrapper for dashboard UI
 */
export function useVariables(organizationId: Id<'organizations'> | undefined) {
  const variables = useQuery(
    api.variables.listByOrganization,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    variables: variables ?? [],
    isLoading: organizationId ? variables === undefined : false,
  }
}

/**
 * Hook for dashboard statistics
 */
export function useDashboardStats(organizationId: Id<'organizations'> | undefined) {
  const stats = useQuery(
    api.dashboard.getStats,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    stats: stats ?? null,
    isLoading: organizationId ? stats === undefined : false,
  }
}

/**
 * Hook for recent activity on the dashboard
 */
export function useRecentActivity(organizationId: Id<'organizations'> | undefined) {
  const activity = useQuery(
    api.dashboard.getRecentActivity,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    activity: activity ?? [],
    isLoading: organizationId ? activity === undefined : false,
  }
}

/**
 * Hook for recent projects on the dashboard
 */
export function useRecentProjects(organizationId: Id<'organizations'> | undefined) {
  const projects = useQuery(
    api.dashboard.getRecentProjects,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    projects: projects ?? [],
    isLoading: organizationId ? projects === undefined : false,
  }
}

/**
 * Hook for team members quick view
 */
export function useTeamMembersQuickView(organizationId: Id<'organizations'> | undefined) {
  const members = useQuery(
    api.dashboard.getTeamMembers,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    members: members ?? [],
    isLoading: organizationId ? members === undefined : false,
  }
}

/**
 * Hook for onboarding status
 */
export function useOnboardingStatus(organizationId: Id<'organizations'> | undefined) {
  const status = useQuery(
    api.dashboard.getOnboardingStatus,
    organizationId ? { organizationId } : 'skip'
  )

  return {
    status: status ?? null,
    isLoading: organizationId ? status === undefined : false,
  }
}
