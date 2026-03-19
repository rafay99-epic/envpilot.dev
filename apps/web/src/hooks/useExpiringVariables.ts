import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useExpiringVariables(
  organizationId: Id<"organizations"> | undefined,
  userId: Id<"users"> | undefined
) {
  const data = useQuery(
    api.variables.listExpiringVariables,
    organizationId && userId ? { organizationId, userId } : "skip"
  );
  return { variables: data ?? [], isLoading: data === undefined };
}
