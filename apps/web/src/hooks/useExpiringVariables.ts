import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useExpiringVariables(
  organizationId: Id<"organizations"> | undefined,
  userId: Id<"users"> | undefined
) {
  const data = useQuery(
    api.features.variables.rotation.listExpiringVariables,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    organizationId && userId ? { organizationId } : "skip"
  );
  return { variables: data ?? [], isLoading: data === undefined };
}
