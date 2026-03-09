/**
 * Shared types for ENV Connect
 *
 * These are the common interfaces used across the web app, CLI, and VS Code extension.
 * Each surface extends these base types with its own additions.
 */

// --- Core Entities ---

export interface User {
  id: string;
  email: string;
  name?: string | null;
}

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  tier: "free" | "pro";
}

export interface Project {
  _id: string;
  name: string;
  slug: string;
  description?: string | null;
  organizationId: string;
  icon?: string | null;
  color?: string | null;
}

export interface EnvironmentVariable {
  _id: string;
  key: string;
  projectId: string;
  environments: string[];
  updatedAt?: number;
}

// --- Enums & Unions ---

export type MembershipRole = "admin" | "team_lead" | "member";
export type Environment = "development" | "staging" | "production";

// --- API ---

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}
