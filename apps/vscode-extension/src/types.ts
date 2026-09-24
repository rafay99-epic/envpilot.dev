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
  unifiedRole?: string;
  assigned?: boolean;
  environmentScope?: string[] | null;
  capabilities?: Record<string, boolean> | null;
  hasWriteAccess?: boolean;
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
  access?: "read" | "write";
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
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  sessionId?: string;
}

export interface SyncResult {
  success: boolean;
  variablesCount: number;
  targetFile: string;
  error?: string;
}

export interface ExtensionConfig {
  serverUrl: string;
  autoSync: boolean;
  targetFile: string;
  environment: string;
  preventCopyOnRevoke: boolean;
  commitGuardEnabled: boolean;
  commitGuardAutoInstallHook: boolean;
  idlePauseMinutes: number;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
}

export interface LinkedDirectory {
  directoryPath: string;
  targetFile: string;
  environments: string[];
  displayName?: string;
  lastSyncedAt: number | null;
  createdAt: number;
}

export interface LinkedProjectV2 {
  projectId: string;
  projectName: string;
  organizationId: string;
  organizationName: string;
  accessToken: string;
  expiresAt: number;
  directories: LinkedDirectory[];
  defaultEnvironment: string;
  createdAt: number;
  updatedAt: number;
  autoUnsyncOnClose?: boolean;
}

export type ConflictStrategy = "overwrite" | "backup" | "merge" | "skip";

export interface LinkDirectoryOptions {
  directoryPath: string;
  targetFile?: string;
  environments?: string[];
  conflictStrategy?: ConflictStrategy;
  displayName?: string;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  existingFile?: string;
  existingVariableCount?: number;
  existingKeys?: string[];
}
