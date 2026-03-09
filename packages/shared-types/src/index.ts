// Core entity interfaces shared across web, CLI, and extension

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

export type MembershipRole = "admin" | "team_lead" | "member";
export type Environment = "development" | "staging" | "production";

export interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}
