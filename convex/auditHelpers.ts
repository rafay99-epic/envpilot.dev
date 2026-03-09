import { v } from "convex/values";
import { mutation, MutationCtx } from "./_generated/server";
import { Id, Doc } from "./_generated/dataModel";

/**
 * Audit Log Helper Functions
 *
 * Provides consistent, comprehensive audit logging across the application.
 * All sensitive operations should use these helpers to ensure compliance.
 */

// Type definitions for audit log entries
export type AuditAction = Doc<"auditLogs">["action"];
export type AuditSeverity = "info" | "warning" | "error" | "critical";
export type AuditResourceType =
  | "organization"
  | "project"
  | "variable"
  | "permission"
  | "access_token"
  | "invitation"
  | "billing"
  | "security";

// Severity mapping for different action types
const ACTION_SEVERITY_MAP: Record<string, AuditSeverity> = {
  // Critical actions
  "org.deleted": "critical",
  "variable.deleted": "critical",
  "security.unauthorized_attempt": "critical",
  "security.suspicious_activity": "critical",
  "billing.payment_failed": "critical",

  // Error/Warning actions
  "security.access_denied": "warning",
  "security.permission_check_failed": "warning",
  "security.token_validation_failed": "warning",
  "security.rate_limit_exceeded": "warning",
  "permission.revoked": "warning",
  "permission.bulk_revoked": "warning",
  "access.token_revoked": "warning",
  "org.member_removed": "warning",

  // Info actions (default)
  "variable.accessed": "info",
  "variable.exported": "info",
  "variable.copied": "info",
  "permission.granted": "info",
  "org.created": "info",
  "project.created": "info",
  "variable.created": "info",
  "variable.requested": "info",
  "variable.request_approved": "info",
  "variable.request_rejected": "warning",
  "variable.request_canceled": "info",
};

// Resource type mapping for different action types
const ACTION_RESOURCE_MAP: Record<string, AuditResourceType> = {
  // Organization
  "org.created": "organization",
  "org.updated": "organization",
  "org.deleted": "organization",
  "org.member_added": "organization",
  "org.member_removed": "organization",
  "org.member_role_changed": "organization",

  // Project
  "project.created": "project",
  "project.updated": "project",
  "project.deleted": "project",

  // Variable
  "variable.created": "variable",
  "variable.updated": "variable",
  "variable.deleted": "variable",
  "variable.accessed": "variable",
  "variable.exported": "variable",
  "variable.copied": "variable",
  "variable.bulk_imported": "variable",
  "variable.rollback": "variable",
  "variable.restored": "variable",
  "variable.requested": "variable",
  "variable.request_approved": "variable",
  "variable.request_rejected": "variable",
  "variable.request_canceled": "variable",

  // Permission
  "permission.granted": "permission",
  "permission.revoked": "permission",
  "permission.updated": "permission",
  "permission.expired": "permission",
  "permission.bulk_granted": "permission",
  "permission.bulk_revoked": "permission",

  // Access Token
  "access.token_created": "access_token",
  "access.token_revoked": "access_token",
  "access.token_refreshed": "access_token",
  "access.token_used": "access_token",
  "access.extension_linked": "access_token",
  "access.extension_unlinked": "access_token",

  // Invitation
  "invitation.sent": "invitation",
  "invitation.accepted": "invitation",
  "invitation.declined": "invitation",
  "invitation.expired": "invitation",
  "invitation.resent": "invitation",

  // Billing
  "billing.subscription_created": "billing",
  "billing.subscription_updated": "billing",
  "billing.subscription_canceled": "billing",
  "billing.payment_succeeded": "billing",
  "billing.payment_failed": "billing",
  "billing.tier_upgraded": "billing",
  "billing.tier_downgraded": "billing",

  // Security
  "security.access_denied": "security",
  "security.unauthorized_attempt": "security",
  "security.permission_check_failed": "security",
  "security.token_validation_failed": "security",
  "security.rate_limit_exceeded": "security",
  "security.suspicious_activity": "security",
};

export interface AuditLogInput {
  organizationId: Id<"organizations">;
  projectId?: Id<"projects">;
  variableId?: Id<"environmentVariables">;
  userId: Id<"users">;
  action: AuditAction;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  geoLocation?: string;
  involvesSensitiveData?: boolean;
  // Override auto-derived values
  severity?: AuditSeverity;
  resourceType?: AuditResourceType;
}

/**
 * Create an audit log entry with auto-derived metadata
 */
export async function createAuditLog(
  ctx: MutationCtx,
  input: AuditLogInput
): Promise<Id<"auditLogs">> {
  const now = Date.now();

  // Auto-derive severity if not provided
  const severity =
    input.severity ?? ACTION_SEVERITY_MAP[input.action] ?? "info";

  // Auto-derive resource type if not provided
  const resourceType = input.resourceType ?? ACTION_RESOURCE_MAP[input.action];

  return await ctx.db.insert("auditLogs", {
    organizationId: input.organizationId,
    projectId: input.projectId,
    variableId: input.variableId,
    userId: input.userId,
    action: input.action,
    details: input.details ? JSON.stringify(input.details) : undefined,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    severity,
    resourceType,
    involvesSensitiveData: input.involvesSensitiveData,
    sessionId: input.sessionId,
    requestId: input.requestId,
    geoLocation: input.geoLocation,
    createdAt: now,
  });
}

/**
 * Log a security event (access denied, unauthorized attempt, etc.)
 */
export async function logSecurityEvent(
  ctx: MutationCtx,
  input: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    action:
      | "security.access_denied"
      | "security.unauthorized_attempt"
      | "security.permission_check_failed"
      | "security.token_validation_failed"
      | "security.rate_limit_exceeded"
      | "security.suspicious_activity";
    details: {
      attemptedAction: string;
      resource?: string;
      reason: string;
      [key: string]: unknown;
    };
    projectId?: Id<"projects">;
    variableId?: Id<"environmentVariables">;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<Id<"auditLogs">> {
  return createAuditLog(ctx, {
    ...input,
    resourceType: "security",
    involvesSensitiveData: true,
  });
}

/**
 * Log a variable access event with comprehensive details
 */
export async function logVariableAccess(
  ctx: MutationCtx,
  input: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    variableId: Id<"environmentVariables">;
    userId: Id<"users">;
    accessType: "view" | "copy" | "export";
    variableKey: string;
    isSensitive: boolean;
    environment?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }
): Promise<Id<"auditLogs">> {
  const action =
    input.accessType === "export"
      ? "variable.exported"
      : input.accessType === "copy"
        ? "variable.copied"
        : "variable.accessed";

  return createAuditLog(ctx, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    variableId: input.variableId,
    userId: input.userId,
    action,
    details: {
      variableKey: input.variableKey,
      accessType: input.accessType,
      isSensitive: input.isSensitive,
      environment: input.environment,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    sessionId: input.sessionId,
    involvesSensitiveData: input.isSensitive,
    resourceType: "variable",
  });
}

/**
 * Log a permission change event
 */
export async function logPermissionChange(
  ctx: MutationCtx,
  input: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    variableId: Id<"environmentVariables">;
    userId: Id<"users">;
    action:
      | "permission.granted"
      | "permission.revoked"
      | "permission.updated"
      | "permission.bulk_granted"
      | "permission.bulk_revoked";
    details: {
      targetUserId?: Id<"users">;
      targetUserEmail?: string;
      permission?: string;
      previousPermission?: string;
      variableKey?: string;
      affectedCount?: number;
      expiresAt?: number;
      [key: string]: unknown;
    };
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<Id<"auditLogs">> {
  return createAuditLog(ctx, {
    ...input,
    resourceType: "permission",
  });
}

/**
 * Log a bulk operation with details
 */
export async function logBulkOperation(
  ctx: MutationCtx,
  input: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    userId: Id<"users">;
    action:
      | "variable.bulk_imported"
      | "permission.bulk_granted"
      | "permission.bulk_revoked";
    details: {
      totalCount: number;
      successCount: number;
      failedCount?: number;
      skippedCount?: number;
      affectedItems?: string[];
      [key: string]: unknown;
    };
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<Id<"auditLogs">> {
  return createAuditLog(ctx, {
    ...input,
    resourceType: input.action.startsWith("variable")
      ? "variable"
      : "permission",
  });
}

/**
 * Parse user agent string to extract browser/device info
 */
export function parseUserAgent(userAgent?: string): {
  browser?: string;
  os?: string;
  device?: string;
} {
  if (!userAgent) return {};

  let browser: string | undefined;
  let os: string | undefined;
  let device: string | undefined;

  // Browser detection
  if (userAgent.includes("Chrome")) {
    browser = "Chrome";
  } else if (userAgent.includes("Firefox")) {
    browser = "Firefox";
  } else if (userAgent.includes("Safari")) {
    browser = "Safari";
  } else if (userAgent.includes("Edge")) {
    browser = "Edge";
  }

  // OS detection
  if (userAgent.includes("Windows")) {
    os = "Windows";
  } else if (userAgent.includes("Mac OS")) {
    os = "macOS";
  } else if (userAgent.includes("Linux")) {
    os = "Linux";
  } else if (userAgent.includes("Android")) {
    os = "Android";
  } else if (userAgent.includes("iOS") || userAgent.includes("iPhone")) {
    os = "iOS";
  }

  // Device detection
  if (userAgent.includes("Mobile")) {
    device = "Mobile";
  } else if (userAgent.includes("Tablet")) {
    device = "Tablet";
  } else {
    device = "Desktop";
  }

  return { browser, os, device };
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `req_${timestamp}_${randomPart}`;
}

/**
 * Generate a session ID for correlating related actions
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 12);
  return `sess_${timestamp}_${randomPart}`;
}

// Convex mutation for logging security events from the client
export const logSecurityEventMutation = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    action: v.union(
      v.literal("security.access_denied"),
      v.literal("security.unauthorized_attempt"),
      v.literal("security.permission_check_failed"),
      v.literal("security.token_validation_failed"),
      v.literal("security.rate_limit_exceeded"),
      v.literal("security.suspicious_activity")
    ),
    details: v.object({
      attemptedAction: v.string(),
      resource: v.optional(v.string()),
      reason: v.string(),
    }),
    projectId: v.optional(v.id("projects")),
    variableId: v.optional(v.id("environmentVariables")),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return logSecurityEvent(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: args.action,
      details: args.details,
      projectId: args.projectId,
      variableId: args.variableId,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
    });
  },
});

// Convex mutation for logging audit export events
export const logAuditExport = mutation({
  args: {
    organizationId: v.id("organizations"),
    userId: v.id("users"),
    exportFormat: v.union(v.literal("csv"), v.literal("json")),
    recordCount: v.number(),
    dateRange: v.optional(
      v.object({
        start: v.number(),
        end: v.number(),
      })
    ),
    filters: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return createAuditLog(ctx, {
      organizationId: args.organizationId,
      userId: args.userId,
      action: "audit.exported",
      details: {
        exportFormat: args.exportFormat,
        recordCount: args.recordCount,
        dateRange: args.dateRange,
        filters: args.filters,
      },
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      resourceType: "security",
    });
  },
});
