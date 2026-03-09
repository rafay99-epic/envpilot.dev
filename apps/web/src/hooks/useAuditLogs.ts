"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for listing audit logs by organization
 */
export function useOrganizationAuditLogs(
  organizationId: Id<"organizations"> | undefined,
  options?: { limit?: number; offset?: number },
) {
  return useQuery(
    api.auditLogs.listByOrganization,
    organizationId
      ? { organizationId, limit: options?.limit, offset: options?.offset }
      : "skip",
  );
}

/**
 * Hook for listing audit logs by project
 */
export function useProjectAuditLogs(
  projectId: Id<"projects"> | undefined,
  options?: { limit?: number },
) {
  return useQuery(
    api.auditLogs.listByProject,
    projectId ? { projectId, limit: options?.limit } : "skip",
  );
}

/**
 * Hook for listing audit logs by variable
 */
export function useVariableAuditLogs(
  variableId: Id<"environmentVariables"> | undefined,
  options?: { limit?: number },
) {
  return useQuery(
    api.auditLogs.listByVariable,
    variableId ? { variableId, limit: options?.limit } : "skip",
  );
}

/**
 * Hook for listing security events
 */
export function useSecurityEvents(
  organizationId: Id<"organizations"> | undefined,
  options?: { limit?: number; includeSeverity?: string[] },
) {
  return useQuery(
    api.auditLogs.listSecurityEvents,
    organizationId
      ? {
          organizationId,
          limit: options?.limit,
          includeSeverity: options?.includeSeverity,
        }
      : "skip",
  );
}

/**
 * Hook for listing sensitive data access logs
 */
export function useSensitiveDataAccess(
  organizationId: Id<"organizations"> | undefined,
  options?: { startTime?: number; endTime?: number; limit?: number },
) {
  return useQuery(
    api.auditLogs.listSensitiveDataAccess,
    organizationId
      ? {
          organizationId,
          startTime: options?.startTime,
          endTime: options?.endTime,
          limit: options?.limit,
        }
      : "skip",
  );
}

/**
 * Hook for listing permission changes
 */
export function usePermissionChanges(
  organizationId: Id<"organizations"> | undefined,
  options?: { startTime?: number; endTime?: number; limit?: number },
) {
  return useQuery(
    api.auditLogs.listPermissionChanges,
    organizationId
      ? {
          organizationId,
          startTime: options?.startTime,
          endTime: options?.endTime,
          limit: options?.limit,
        }
      : "skip",
  );
}

/**
 * Hook for audit log summary
 */
export function useAuditLogSummary(
  organizationId: Id<"organizations"> | undefined,
  daysBack?: number,
) {
  return useQuery(
    api.auditLogs.getSummary,
    organizationId ? { organizationId, daysBack } : "skip",
  );
}

/**
 * Hook for compliance report
 */
export function useComplianceReport(
  organizationId: Id<"organizations"> | undefined,
  startTime: number,
  endTime: number,
) {
  return useQuery(
    api.auditLogs.getComplianceReport,
    organizationId ? { organizationId, startTime, endTime } : "skip",
  );
}

/**
 * Hook for getting recent alerts
 */
export function useRecentAlerts(
  organizationId: Id<"organizations"> | undefined,
  limit?: number,
) {
  return useQuery(
    api.auditLogs.getRecentAlerts,
    organizationId ? { organizationId, limit } : "skip",
  );
}

/**
 * Hook for getting alert counts
 */
export function useAlertCount(
  organizationId: Id<"organizations"> | undefined,
  since?: number,
) {
  return useQuery(
    api.auditLogs.getAlertCount,
    organizationId ? { organizationId, since } : "skip",
  );
}

/**
 * Hook for audit logs with time range filter
 */
export function useAuditLogsByTimeRange(
  organizationId: Id<"organizations"> | undefined,
  startTime: number,
  endTime: number,
  options?: {
    limit?: number;
    actionFilter?: string[];
    severityFilter?: string[];
    resourceTypeFilter?: string[];
  },
) {
  return useQuery(
    api.auditLogs.listByTimeRange,
    organizationId
      ? {
          organizationId,
          startTime,
          endTime,
          limit: options?.limit,
          actionFilter: options?.actionFilter,
          severityFilter: options?.severityFilter,
          resourceTypeFilter: options?.resourceTypeFilter,
        }
      : "skip",
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
  includeDetails?: boolean,
) {
  return useQuery(
    api.auditLogs.getForExport,
    organizationId
      ? { organizationId, startTime, endTime, format, includeDetails }
      : "skip",
  );
}

/**
 * Hook for audit-related mutations
 * Note: These mutations are defined in convex/auditHelpers.ts
 * After running `npx convex dev`, they will be available as api.auditHelpers.*
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
