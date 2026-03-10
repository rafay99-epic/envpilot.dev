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
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
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
