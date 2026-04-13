"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for listing projects in an organization
 */
export function useOrganizationProjects(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.projects.listByOrganization,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for listing projects with stats
 */
export function useOrganizationProjectsWithStats(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.projects.listWithStats,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for getting a single project
 */
export function useProject(projectId: Id<"projects"> | undefined) {
  return useQuery(api.projects.getById, projectId ? { projectId } : "skip");
}

/**
 * Hook for listing all projects accessible to a user
 */
export function useUserProjects(userId: Id<"users"> | undefined) {
  return useQuery(api.projects.listForUser, userId ? { userId } : "skip");
}

/**
 * Hook for getting a project by slug (uses Convex index — single lookup, not fetch-all-and-filter)
 */
export function useProjectBySlug(
  organizationId: Id<"organizations"> | string | undefined,
  slug: string | undefined
) {
  return useQuery(
    api.projects.getBySlug,
    organizationId && slug
      ? { organizationId: organizationId as Id<"organizations">, slug }
      : "skip"
  );
}
