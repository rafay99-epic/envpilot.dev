"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook to get all members of a project
 */
export function useProjectMembers(projectId: Id<"projects"> | undefined) {
  const members = useQuery(
    api.features.projects.members.listByProject,
    projectId ? { projectId } : "skip"
  );

  return {
    members: members ?? [],
    isLoading: projectId ? members === undefined : false,
  };
}

/**
 * Hook to check if a user has membership in a project
 */
export function useProjectMembership(
  projectId: Id<"projects"> | undefined,
  userId: Id<"users"> | undefined
) {
  const membership = useQuery(
    api.features.projects.members.getProjectMembership,
    projectId && userId ? { projectId } : "skip"
  );

  return {
    membership: membership ?? null,
    isLoading: projectId && userId ? membership === undefined : false,
  };
}

/**
 * Hook to get org members who can be assigned to a project
 */
export function useAssignableProjectMembers(
  projectId: Id<"projects"> | undefined,
  requestingUserId: Id<"users"> | undefined
) {
  const members = useQuery(
    api.features.projects.members.getAssignableOrgMembers,
    projectId && requestingUserId ? { projectId } : "skip"
  );

  return {
    members: members ?? [],
    isLoading: projectId && requestingUserId ? members === undefined : false,
  };
}
