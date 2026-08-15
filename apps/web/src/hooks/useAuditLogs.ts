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

/**
 * Hook for audit-related mutations
 * Note: These mutations are defined in convex/auditHelpers.ts
 * After running `npx convex dev`, they will be available as lib/audit helpers
 */
export function useAuditMutations() {
  // Placeholder functions - will use actual Convex mutations after codegen
  // For now, these are no-op functions
  const logSecurityEvent = async (_args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action: string;
    details: { attemptedAction: string; resource?: string; reason: string };
    projectId?: Id<"projects">;
    variableId?: Id<"environmentVariables">;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    // This will be replaced with actual mutation after Convex codegen
    return null;
  };

  const logAuditExport = async (_args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    exportFormat: "csv" | "json";
    recordCount: number;
    dateRange?: { start: number; end: number };
    filters?: string;
    ipAddress?: string;
    userAgent?: string;
  }) => {
    // This will be replaced with actual mutation after Convex codegen
    return null;
  };

  return {
    logSecurityEvent,
    logAuditExport,
  };
}
