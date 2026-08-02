import { v } from "convex/values";
import {
  mutation,
  type DatabaseReader,
  type MutationCtx,
} from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import { scheduleWebhookNotification } from "../features/integrations/notify";

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
  | "security"
  | "account";

// Severity mapping for different action types
const ACTION_SEVERITY_MAP: Record<string, AuditSeverity> = {
  // Critical actions
  "org.deleted": "critical",
  "org.transferred": "critical",
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
  "project.moved": "warning",
  "variable.created": "info",
  "variable.requested": "info",
  "variable.request_approved": "info",
  "variable.request_rejected": "warning",
  "variable.request_canceled": "info",
  // Secret sharing actions
  "share.created": "info",
  "share.viewed": "warning",
  "share.burned": "info",
  "share.expired": "info",
  "share.revoked": "info",
  "share.otp_sent": "info",
  "share.otp_failed": "warning",
  // Project lifecycle
  "project.restored": "info",
  "project.favorited": "info",
  "project.unfavorited": "info",
  // Tag actions
  "tag.created": "info",
  "tag.updated": "info",
  "tag.deleted": "info",
  // Template actions
  "template.created": "info",
  "template.updated": "info",
  "template.deleted": "info",
  // Shared account actions
  "account.created": "info",
  "account.updated": "info",
  "account.deleted": "critical",
  "account.accessed": "info",
  "account.permission_granted": "info",
  "account.permission_revoked": "warning",
  "account.permission_updated": "info",
  // Notification webhooks
  "integration.webhook_created": "info",
  "integration.webhook_updated": "info",
  "integration.webhook_deleted": "warning",
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
  "org.transferred": "organization",

  // Project
  "project.created": "project",
  "project.updated": "project",
  "project.deleted": "project",
  "project.moved": "project",
  "project.restored": "project",
  "project.favorited": "project",
  "project.unfavorited": "project",

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
  // Secret sharing
  "share.created": "security",
  "share.viewed": "security",
  "share.burned": "security",
  "share.expired": "security",
  "share.revoked": "security",
  "share.otp_sent": "security",
  "share.otp_failed": "security",
  // Tags (org-scoped labels)
  "tag.created": "organization",
  "tag.updated": "organization",
  "tag.deleted": "organization",
  // Templates (org-scoped)
  "template.created": "organization",
  "template.updated": "organization",
  "template.deleted": "organization",
  // Shared accounts
  "account.created": "account",
  "account.updated": "account",
  "account.deleted": "account",
  "account.accessed": "account",
  "account.permission_granted": "account",
  "account.permission_revoked": "account",
  "account.permission_updated": "account",
  // Notification webhooks (org-scoped config)
  "integration.webhook_created": "organization",
  "integration.webhook_updated": "organization",
  "integration.webhook_deleted": "organization",
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
 * Resolve an untrusted project candidate for an organization-scoped audit row.
 * Invalid, deleted, and cross-organization projects deliberately collapse to
 * `undefined` so audit enrichment can never attach another tenant's project.
 */
export async function resolveAuditProjectId(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  projectId: Id<"projects"> | undefined
): Promise<Id<"projects"> | undefined> {
  if (projectId === undefined) return undefined;
  const project = await db.get(projectId);
  return project?.organizationId === organizationId &&
    project.deletedAt === undefined
    ? project._id
    : undefined;
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

  const auditLogId = await ctx.db.insert("auditLogs", {
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
  await scheduleWebhookNotification(ctx, auditLogId, input.action);
  return auditLogId;
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
  const auditLogId = await createAuditLog(ctx, {
    ...input,
    resourceType: "security",
    involvesSensitiveData: true,
  });

  return auditLogId;
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

  const auditLogId = await createAuditLog(ctx, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    variableId: input.variableId,
    userId: input.userId,
    action,
    details: {
      variableKey: input.variableKey,
      key: input.variableKey,
      accessType: input.accessType,
      isSensitive: input.isSensitive,
      environment: input.environment,
      environments: input.environment ? [input.environment] : [],
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    sessionId: input.sessionId,
    involvesSensitiveData: input.isSensitive,
    resourceType: "variable",
  });

  return auditLogId;
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
