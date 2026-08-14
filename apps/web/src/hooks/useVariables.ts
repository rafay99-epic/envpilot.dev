"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for listing variables in a project (access-aware).
 *
 * Routes through listWithAccess so env-scoped developers and ungranted
 * users never receive variable data (including vaultRef) outside their
 * access. Requires the current Convex user id. Optional environment
 * filtering is applied client-side to preserve the previous call shape.
 */
export function useProjectVariables(
  projectId: Id<"projects"> | undefined,
  userId: Id<"users"> | undefined,
  environment?: string
) {
  const variables = useQuery(
    api.features.variables.queries.listWithAccess,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    projectId && userId ? { projectId } : "skip"
  );

  if (!variables) return variables;
  if (!environment) return variables;
  return variables.filter((v) => v.environments.includes(environment));
}

/**
 * Hook for getting variable version history.
 * Requires the current Convex user id — the query is access-gated on the
 * caller's effective access to the variable (version rows carry vaultRefs).
 */
export function useVariableHistory(
  variableId: Id<"environmentVariables"> | undefined,
  userId: Id<"users"> | undefined,
  limit?: number
) {
  return useQuery(
    api.features.variables.queries.getVersionHistory,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    variableId && userId ? { variableId, limit } : "skip"
  );
}
