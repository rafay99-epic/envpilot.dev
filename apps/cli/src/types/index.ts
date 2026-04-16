import { z } from "zod";

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

// User types
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
});

export type User = z.infer<typeof userSchema>;

// Organization types
export const organizationSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  tier: z.enum(["free", "pro"]),
  role: z.string().optional(),
});

export type Organization = z.infer<typeof organizationSchema>;

// Project role type (project-level access)
export type ProjectRole = "viewer" | "developer" | "manager";

// Project types
export const projectSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  organizationId: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  userRole: z.string().nullable().optional(),
  projectRole: z.string().nullable().optional(),
});

export type Project = z.infer<typeof projectSchema>;

// Variable types
export const variableTagSchema = z.object({
  _id: z.string(),
  name: z.string(),
  color: z.string(),
});

export type VariableTag = z.infer<typeof variableTagSchema>;

export const variableSchema = z.object({
  _id: z.string(),
  key: z.string(),
  value: z.string(),
  environment: z.enum(["development", "staging", "production"]),
  projectId: z.string(),
  description: z.string().optional(),
  isSensitive: z.boolean().optional(),
  version: z.number().optional(),
  updatedAt: z.number().optional(),
  createdAt: z.number().optional(),
  tags: z.array(variableTagSchema).optional(),
});

export type Variable = z.infer<typeof variableSchema>;

// Environment type
export const environmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type Environment = z.infer<typeof environmentSchema>;

// CLI Config schema
export const cliConfigSchema = z.object({
  apiUrl: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  activeProjectId: z.string().optional(),
  activeOrganizationId: z.string().optional(),
  user: userSchema.optional(),
  role: z.enum(["admin", "team_lead", "member"]).optional(),
});

export type CLIConfig = z.infer<typeof cliConfigSchema>;

// Project config schema (.envpilot file)
export const projectConfigSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  environment: environmentSchema.default("development"),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;

// Project entry within multi-project .envpilot config
export const projectEntrySchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  projectName: z.string().default(""),
  organizationName: z.string().default(""),
  environment: environmentSchema.default("development"),
});
export type ProjectEntry = z.infer<typeof projectEntrySchema>;

// Multi-project config (.envpilot file)
export const projectConfigV2Schema = z.object({
  version: z.literal(1),
  activeProjectId: z.string(),
  projects: z.array(projectEntrySchema).min(1),
});
export type ProjectConfigV2 = z.infer<typeof projectConfigV2Schema>;

// Auth session types
export interface AuthSession {
  code: string;
  status: "pending" | "authenticated" | "expired";
  accessToken?: string;
  expiresAt: number;
}

// CLI token types
export interface CLIToken {
  token: string;
  expiresAt: number;
  projectId: string;
  organizationId: string;
}

// Tier info
export interface TierInfo {
  tier: "free" | "pro";
  apiAccessEnabled: boolean;
  limits: {
    projects: number;
    variablesPerProject: number;
    teamMembers: number;
  };
}

// Usage info (from /api/cli/usage)
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
