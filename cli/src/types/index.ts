import { z } from 'zod'

// API Response types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// User types
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
})

export type User = z.infer<typeof userSchema>

// Organization types
export const organizationSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  tier: z.enum(['free', 'pro']),
})

export type Organization = z.infer<typeof organizationSchema>

// Project types
export const projectSchema = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  organizationId: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
})

export type Project = z.infer<typeof projectSchema>

// Variable types
export const variableSchema = z.object({
  _id: z.string(),
  key: z.string(),
  value: z.string(),
  environment: z.enum(['development', 'staging', 'production']),
  projectId: z.string(),
  description: z.string().optional(),
  isSensitive: z.boolean().optional(),
})

export type Variable = z.infer<typeof variableSchema>

// Environment type
export const environmentSchema = z.enum(['development', 'staging', 'production'])
export type Environment = z.infer<typeof environmentSchema>

// CLI Config schema
export const cliConfigSchema = z.object({
  apiUrl: z.string().url(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  activeProjectId: z.string().optional(),
  activeOrganizationId: z.string().optional(),
  user: userSchema.optional(),
})

export type CLIConfig = z.infer<typeof cliConfigSchema>

// Project config schema (.envconnect file)
export const projectConfigSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  environment: environmentSchema.default('development'),
})

export type ProjectConfig = z.infer<typeof projectConfigSchema>

// Auth session types
export interface AuthSession {
  code: string
  status: 'pending' | 'authenticated' | 'expired'
  accessToken?: string
  expiresAt: number
}

// CLI token types
export interface CLIToken {
  token: string
  expiresAt: number
  projectId: string
  organizationId: string
}

// Tier info
export interface TierInfo {
  tier: 'free' | 'pro'
  apiAccessEnabled: boolean
  limits: {
    projects: number
    variablesPerProject: number
    teamMembers: number
  }
}
