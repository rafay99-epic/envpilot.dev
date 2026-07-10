/**
 * Compat barrel — implementation lives in lib/audit.ts.
 */
export {
  createAuditLog,
  logSecurityEvent,
  logVariableAccess,
  logPermissionChange,
  logBulkOperation,
  parseUserAgent,
  generateRequestId,
  generateSessionId,
} from "./lib/audit";
export type {
  AuditAction,
  AuditSeverity,
  AuditResourceType,
  AuditLogInput,
} from "./lib/audit";
