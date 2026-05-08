import type { Id } from "convex/_generated/dataModel";

export interface User {
  _id: Id<"users">;
  email: string;
  name?: string;
  avatarUrl?: string;
}

export interface Organization {
  _id: Id<"organizations">;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  role: "admin" | "team_lead" | "member";
}

export interface Project {
  _id: Id<"projects">;
  name: string;
  slug: string;
  description?: string;
  organizationId: Id<"organizations">;
  icon?: string;
  color?: string;
  createdAt: number;
}

export interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  vaultRef: string;
  description?: string;
  environments: string[];
  projectId: Id<"projects">;
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface AuditLogEntry {
  _id: Id<"auditLogs">;
  organizationId: Id<"organizations">;
  projectId?: Id<"projects">;
  userId: Id<"users">;
  action: string;
  details?: string;
  severity?: "info" | "warning" | "error" | "critical";
  createdAt: number;
}

export interface MobileAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    _id: string;
    email: string;
    name?: string;
  };
  expiresAt: number;
}
