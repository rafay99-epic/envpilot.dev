import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useExpiringVariables(
  organizationId: Id<"organizations"> | undefined
) {
  const data = useQuery(
    api.variables.listExpiringVariables,
    organizationId ? { organizationId } : "skip"
  );
  return { variables: data ?? [], isLoading: data === undefined };
}
