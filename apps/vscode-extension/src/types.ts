/**
 * Types for Envpilot VS Code Extension
 */

export type MembershipRole = "admin" | "team_lead" | "member";
export type ProjectRole = "viewer" | "developer" | "manager";

export interface User {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  tier: "free" | "pro";
  role?: MembershipRole;
  /**
   * Unified org role (owner/project_manager/team_lead/developer), additive
   * alongside the legacy `role` field. Only present once the server-side
   * `/api/extension/*` routes are updated to send it — normalize with
   * `normalizeOrgRole`/`formatRoleLabel` from `../roles` rather than
   * comparing raw strings.
   */
  unifiedRole?: string;
}

export interface UsageInfo {
  tier: "free" | "pro";
  enforcementEnabled: boolean;
  limits: {
    projects: number | null;
    variablesPerProject: number | null;
    teamMembers: number | null;
  };
  usage: {
    projects: number;
    teamMembers: number;
    pendingInvitations: number;
    totalVariables: number;
    maxVariablesInProject: number;
    maxVariablesProjectName: string;
    variablesPerProject: Array<{
      projectId: string;
      projectName: string;
      count: number;
    }>;
  };
  features: {
    versionHistory: boolean;
    bulkImport: boolean;
    extensionAccess: boolean;
    granularPermissions: boolean;
    auditLogRetentionDays: number;
  };
}

export interface VariableRequest {
  _id: string;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  status: "pending" | "approved" | "rejected" | "canceled";
  createdAt: number;
  reviewReason?: string;
}

export interface Project {
  _id: string;
  name: string;
  slug: string;
  description: string | null;
  organizationId: string;
  icon: string | null;
  color: string | null;
  userRole?: MembershipRole | null;
  projectRole?: ProjectRole | null;
  /**
   * Unified-role fields, mirroring `apps/cli`'s `ProjectAccess` shape. Resolved
   * directly from Convex (projects + membership queries). Prefer these over
   * `userRole`/`projectRole` via `normalizeOrgRole`/`formatRoleLabel`.
   */
  unifiedRole?: string;
  /** Whether the user is actually assigned to this project (vs. grant-only). */
  assigned?: boolean;
  /** Environment scope for a scoped developer; null/undefined = unrestricted. */
  environmentScope?: string[] | null;
}

export interface VariableTag {
  _id: string;
  name: string;
  color: string;
}

export interface EnvironmentVariable {
  _id: string;
  key: string;
  value: string;
  description: string | null;
  environments: string[];
  projectId: string;
  isSensitive: boolean;
  version: number;
  tags?: VariableTag[];
  /**
   * Additive per-variable grant, mirrors the CLI's `access` field. Only
   * meaningful for grant-based (non-role-implied) write access; optional
   * since legacy `/api/extension/variables` responses don't send it yet.
   */
  access?: "read" | "write";
}

/**
 * Additive unified-role metadata that can accompany a variables response
 * (mirrors `apps/cli`'s per-request `meta` block). All fields optional —
 * legacy server deployments only return the bare `role` string today, so
 * every consumer must tolerate this being partially or entirely absent.
 */
export interface VariablesResponseMeta {
  role?: MembershipRole;
  unifiedRole?: string;
  assigned?: boolean;
  grantOnly?: boolean;
  environmentScope?: string[] | null;
  hasWriteAccess?: boolean;
  scopeRestricted?: boolean;
}

export interface ProjectAccess {
  _id: string;
  projectId: string;
  userId: string;
  accessToken: string;
  expiresAt: number;
  deviceId: string;
  deviceName: string;
  isActive: boolean;
  lastUsedAt: number | null;
}

export interface LinkedProject {
  projectId: string;
  projectName: string;
  organizationId: string;
  organizationName: string;
  accessToken: string;
  expiresAt: number;
  environment: string;
  targetFile: string;
  lastSyncedAt: number | null;
  workspacePath: string;
}

export interface AuthSession {
  user: User;
  /** WorkOS AuthKit access token (JWT, ~5 min lifetime). */
  accessToken: string;
  /** WorkOS AuthKit refresh token (long-lived, may rotate on refresh). */
  refreshToken: string;
  /**
   * Account-expiry timestamp used by StorageService to auto-evict a dead
   * account. Left at 0 (falsy = never) for WorkOS sessions: the short-lived
   * access-token `exp` must NOT evict the account — session death is detected
   * solely by a refresh grant being rejected (see TokenManager).
   */
  expiresAt: number;
  /** WorkOS session id (`sid` claim) — recorded for the active-sessions UI. */
  sessionId?: string;
}

export interface TokenValidation {
  valid: boolean;
  reason?: string;
  projectId?: string;
  userId?: string;
  expiresAt?: number;
}

export interface SyncResult {
  success: boolean;
  variablesCount: number;
  targetFile: string;
  error?: string;
}

export interface PermissionStatus {
  hasAccess: boolean;
  reason?: string;
  expiresAt?: number;
}

export interface ExtensionConfig {
  serverUrl: string;
  autoSync: boolean;
  syncInterval: number;
  targetFile: string;
  environment: string;
  preventCopyOnRevoke: boolean;
  commitGuardEnabled: boolean;
  commitGuardAutoInstallHook: boolean;
}

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
}

/**
 * Represents a single directory linked to a project
 */
export interface LinkedDirectory {
  /** Normalized path to the directory */
  directoryPath: string;
  /** Target .env filename in this directory */
  targetFile: string;
  /** Which environments to sync to this directory */
  environments: string[];
  /** Display name for this directory (optional) */
  displayName?: string;
  /** Last sync timestamp for this directory */
  lastSyncedAt: number | null;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Enhanced linked project with multiple directory support
 */
export interface LinkedProjectV2 {
  projectId: string;
  projectName: string;
  organizationId: string;
  organizationName: string;
  accessToken: string;
  expiresAt: number;
  /** All directories linked to this project */
  directories: LinkedDirectory[];
  /** Default environment (from settings) */
  defaultEnvironment: string;
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Conflict resolution strategy for existing .env files
 */
export type ConflictStrategy = "overwrite" | "backup" | "merge" | "skip";

/**
 * Options for linking a directory
 */
export interface LinkDirectoryOptions {
  directoryPath: string;
  targetFile?: string;
  environments?: string[];
  conflictStrategy?: ConflictStrategy;
  displayName?: string;
}

/**
 * Result of a conflict check
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  existingFile?: string;
  existingVariableCount?: number;
  existingKeys?: string[];
}

/**
 * Permission revocation event from the server
 */
export interface PermissionRevocationEvent {
  eventId: string;
  accessToken: string;
  projectId: string;
  reason: string;
  revokedAt: number;
}

/**
 * SSE event types for real-time sync
 */
export type SSEEventType = "connected" | "revocation" | "heartbeat" | "error";

/**
 * SSE event data structure
 */
export interface SSEEvent {
  type: SSEEventType;
  timestamp?: number;
  eventId?: string;
  projectId?: string;
  reason?: string;
  revokedAt?: number;
  message?: string;
}

/**
 * Response from permission events check endpoint
 */
export interface PermissionEventsResponse {
  events: Array<{
    accessToken: string;
    eventId: string;
    projectId: string;
    userId: string;
    reason: string;
    revokedAt: number;
  }>;
  hasRevocations: boolean;
}
