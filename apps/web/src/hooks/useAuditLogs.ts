"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for audit log summary
 */
export function useAuditLogSummary(
  organizationId: Id<"organizations"> | undefined,
  daysBack?: number
) {
  return useQuery(
    api.features.audit.compliance.getSummary,
    organizationId ? { organizationId, daysBack } : "skip"
  );
}

/**
 * Hook for getting audit logs for export
 */
export function useAuditLogsForExport(
  organizationId: Id<"organizations"> | undefined,
  startTime: number,
  endTime: number,
  format: "csv" | "json",
  includeDetails?: boolean
) {
  return useQuery(
    api.features.audit.compliance.getForExport,
    organizationId
      ? { organizationId, startTime, endTime, format, includeDetails }
      : "skip"
  );
}
