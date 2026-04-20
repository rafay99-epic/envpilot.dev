import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useAnomalyEvents(
  organizationId: Id<"organizations"> | undefined,
  options?: {
    status?: "open" | "acknowledged" | "dismissed" | "resolved";
    limit?: number;
  }
) {
  return useQuery(
    api.anomalyDetection.getAnomalyEvents,
    organizationId ? { organizationId, ...options } : "skip"
  );
}

export function useUnresolvedAnomalyCount(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.anomalyDetection.getUnresolvedCount,
    organizationId ? { organizationId } : "skip"
  );
}

export function useAnomalyRules() {
  return useQuery(api.anomalyDetection.listRules, {});
}

export function useAnomalyEventSummary(
  organizationId: Id<"organizations"> | undefined,
  daysBack?: number
) {
  return useQuery(
    api.anomalyDetection.getEventSummary,
    organizationId ? { organizationId, daysBack } : "skip"
  );
}
