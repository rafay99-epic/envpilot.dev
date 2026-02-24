"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Hook for listing variables in a project
 */
export function useProjectVariables(
  projectId: Id<"projects"> | undefined,
  environment?: string
) {
  return useQuery(
    api.variables.listByProject,
    projectId ? { projectId, environment } : "skip"
  );
}

/**
 * Hook for getting a single variable
 */
export function useVariable(variableId: Id<"environmentVariables"> | undefined) {
  return useQuery(
    api.variables.getById,
    variableId ? { variableId } : "skip"
  );
}

/**
 * Hook for getting variable version history
 */
export function useVariableHistory(
  variableId: Id<"environmentVariables"> | undefined,
  limit?: number
) {
  return useQuery(
    api.variables.getVersionHistory,
    variableId ? { variableId, limit } : "skip"
  );
}

/**
 * Hook for listing variables with access info for a user
 */
export function useVariablesWithAccess(
  projectId: Id<"projects"> | undefined,
  userId: Id<"users"> | undefined
) {
  return useQuery(
    api.variables.listWithAccess,
    projectId && userId ? { projectId, userId } : "skip"
  );
}

/**
 * Hook for searching variables across an organization
 */
export function useVariableSearch(
  organizationId: Id<"organizations"> | undefined,
  searchTerm: string
) {
  return useQuery(
    api.variables.search,
    organizationId && searchTerm.length > 0
      ? { organizationId, searchTerm }
      : "skip"
  );
}

/**
 * Hook for variable mutations
 */
export function useVariableMutations() {
  const createVariable = useMutation(api.variables.create);
  const updateVariable = useMutation(api.variables.update);
  const deleteVariable = useMutation(api.variables.remove);
  const restoreVariable = useMutation(api.variables.restore);
  const rollbackVariable = useMutation(api.variables.rollback);
  const logAccess = useMutation(api.variables.logAccess);
  const bulkCreateVariables = useMutation(api.variables.bulkCreate);

  return {
    createVariable,
    updateVariable,
    deleteVariable,
    restoreVariable,
    rollbackVariable,
    logAccess,
    bulkCreateVariables,
  };
}
