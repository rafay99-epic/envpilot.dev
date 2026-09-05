"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/** Workspaces visible to the caller in an organization. */
export function useWorkspaces(organizationId: Id<"organizations"> | undefined) {
  const workspaces = useQuery(
    api.features.workspaces.queries.listByOrganization,
    organizationId ? { organizationId } : "skip"
  );

  return {
    workspaces: workspaces ?? [],
    isLoading: organizationId ? workspaces === undefined : false,
  };
}

/** One workspace with its shared variables and member projects. */
export function useWorkspaceBySlug(
  organizationId: Id<"organizations"> | undefined,
  slug: string | undefined
) {
  return useQuery(
    api.features.workspaces.queries.getBySlug,
    organizationId && slug ? { organizationId, slug } : "skip"
  );
}

/**
 * Variables a project inherits from its workspaces. Read-only rows: the
 * project can see and reveal them, and editing happens in the workspace.
 */
export function useInheritedVariables(projectId: Id<"projects"> | undefined) {
  const rows = useQuery(
    api.features.workspaces.queries.listInheritedForProject,
    projectId ? { projectId } : "skip"
  );

  return {
    inherited: rows ?? [],
    isLoading: projectId ? rows === undefined : false,
  };
}

export function useWorkspaceActions() {
  const create = useMutation(api.features.workspaces.mutations.create);
  const scanDuplicates = useAction(
    api.features.workspaces.adopt.scanDuplicates
  );
  const adoptKeys = useAction(api.features.workspaces.adopt.adoptKeys);
  const setVariableScope = useMutation(
    api.features.workspaces.mutations.setVariableScope
  );
  const addProject = useMutation(api.features.workspaces.mutations.addProject);
  const removeProject = useMutation(
    api.features.workspaces.mutations.removeProject
  );

  return {
    create,
    addProject,
    removeProject,
    scanDuplicates,
    adoptKeys,
    setVariableScope,
  };
}
