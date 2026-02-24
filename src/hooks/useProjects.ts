"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Hook for listing projects in an organization
 */
export function useOrganizationProjects(organizationId: Id<"organizations"> | undefined) {
  return useQuery(
    api.projects.listByOrganization,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for listing projects with stats
 */
export function useOrganizationProjectsWithStats(organizationId: Id<"organizations"> | undefined) {
  return useQuery(
    api.projects.listWithStats,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for getting a single project
 */
export function useProject(projectId: Id<"projects"> | undefined) {
  return useQuery(
    api.projects.getById,
    projectId ? { projectId } : "skip"
  );
}

/**
 * Hook for listing all projects accessible to a user
 */
export function useUserProjects(userId: Id<"users"> | undefined) {
  return useQuery(
    api.projects.listForUser,
    userId ? { userId } : "skip"
  );
}

/**
 * Hook for project mutations
 */
export function useProjectMutations() {
  const createProject = useMutation(api.projects.create);
  const updateProject = useMutation(api.projects.update);
  const deleteProject = useMutation(api.projects.remove);
  const restoreProject = useMutation(api.projects.restore);
  const duplicateProject = useMutation(api.projects.duplicate);

  return {
    createProject,
    updateProject,
    deleteProject,
    restoreProject,
    duplicateProject,
  };
}
