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

// Account types — one per logged-in identity for multi-account support.
// The account id is the user's id (account.id === account.user.id). apiUrl is
// intentionally NOT part of an account: it is a single global CLI setting.
export const accountSchema = z.object({
  id: z.string(),
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  // Stored role string (legacy or unified); normalized on read.
  role: z.string().optional(),
  // Per-account active org/project selection.
  activeOrganizationId: z.string().optional(),
  activeProjectId: z.string().optional(),
});

export type Account = z.infer<typeof accountSchema>;

// Organization types
export const organizationSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  tier: z.enum(["free", "pro"]),
  role: z.string().optional(),
  // Unified org role (additive; legacy responses omit it and fall back to role).
  unifiedRole: z.string().nullable().optional(),
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
  // Unified-role fields (optional so legacy server responses still parse)
  unifiedRole: z.string().nullable().optional(),
  assigned: z.boolean().optional(),
  environmentScope: z.array(z.string()).nullable().optional(),
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
  // Per-variable effective access under the unified model. Optional so older
  // server responses (which omit it) still parse.
  access: z.enum(["read", "write"]).optional(),
});

export type Variable = z.infer<typeof variableSchema>;

// Meta block returned alongside the variables list (/api/cli/variables).
// Every field is optional so legacy server responses still parse; the unified
// backend uses these to describe the caller's access to the project so the CLI
// can build a ProjectAccess and decide file protection / write gating.
export const variablesMetaSchema = z
  .object({
    total: z.number().optional(),
    page: z.number().optional(),
    limit: z.number().optional(),
    decryptionFailures: z.array(z.string()).optional(),
    unifiedRole: z.string().nullable().optional(),
    assigned: z.boolean().optional(),
    grantOnly: z.boolean().optional(),
    environmentScope: z.array(z.string()).nullable().optional(),
    hasWriteAccess: z.boolean().optional(),
    scopeRestricted: z.boolean().optional(),
  })
  .passthrough();

export type VariablesMeta = z.infer<typeof variablesMetaSchema>;

// Environment type
export const environmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);
export type Environment = z.infer<typeof environmentSchema>;

// CLI Config schema
export const cliConfigSchema = z.object({
  // Global CLI setting — shared across all accounts.
  apiUrl: z.string().url(),
  // Multi-account store. Keyed by account id (== user id).
  accounts: z.record(z.string(), accountSchema).optional(),
  // The currently active account id.
  activeAccountId: z.string().optional(),
  // --- Legacy single-account fields ---
  // Retained ONLY so pre-multi-account configs still parse and can be migrated
  // into `accounts` by migrateLegacyConfig(). After migration these are deleted
  // so `accounts` is the single source of truth. Do not read/write directly.
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  activeProjectId: z.string().optional(),
  activeOrganizationId: z.string().optional(),
  user: userSchema.optional(),
  // Stored role string. Kept as a free-form string so both legacy
  // ("admin"/"team_lead"/"member") and unified
  // ("owner"/"project_manager"/"team_lead"/"developer") values round-trip.
  // Normalized on read via getUnifiedRole(); no longer enum-enforced.
  role: z.string().optional(),
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
  // How the pulled .env file's permissions are managed for this project:
  //   auto   → derive from the caller's resolved access (default)
  //   always → force read-only (0o400)
  //   never  → force writable (0o600)
  fileProtection: z.enum(["auto", "always", "never"]).optional(),
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
