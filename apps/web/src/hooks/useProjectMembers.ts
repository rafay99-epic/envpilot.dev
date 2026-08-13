"use client";

import { useMutation, useQuery } from "convex/react";
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

export function useProjectMemberActions() {
  const add = useMutation(api.features.projects.members.addMember);
  const remove = useMutation(api.features.projects.members.removeMember);
  const setEnvironments = useMutation(
    api.features.projects.members.setMemberEnvironments
  );

  return {
    add: (input: {
      projectId: string;
      userId: string;
      environments?: string[];
    }) =>
      add({
        ...input,
        projectId: input.projectId as Id<"projects">,
        userId: input.userId as Id<"users">,
      }),
    remove: (input: { projectId: string; userId: string }) =>
      remove({
        projectId: input.projectId as Id<"projects">,
        userId: input.userId as Id<"users">,
      }),
    setEnvironments: (input: {
      projectId: string;
      userId: string;
      environments?: string[];
    }) =>
      setEnvironments({
        ...input,
        projectId: input.projectId as Id<"projects">,
        userId: input.userId as Id<"users">,
      }),
  };
}
