"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

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
