import { z } from "zod";

/**
 * Environment variable key validation
 * Must start with a letter, followed by letters, numbers, or underscores
 */
export const envKeySchema = z
  .string()
  .min(1, "Key cannot be empty")
  .max(256, "Key cannot exceed 256 characters")
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Key must start with a letter or underscore, followed by letters, numbers, or underscores",
  );

/**
 * Environment variable value validation
 */
export const envValueSchema = z.string().max(65536, "Value cannot exceed 64KB");

/**
 * Environment name validation
 */
export const environmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);

/**
 * Project slug validation
 */
export const projectSlugSchema = z
  .string()
  .min(1, "Slug cannot be empty")
  .max(128, "Slug cannot exceed 128 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen",
  );

/**
 * Organization slug validation
 */
export const organizationSlugSchema = projectSlugSchema;

/**
 * URL validation
 */
export const urlSchema = z.string().url("Must be a valid URL");

/**
 * Token validation
 */
export const tokenSchema = z
  .string()
  .min(1, "Token cannot be empty")
  .regex(/^env_[A-Za-z0-9]{48}$/, "Invalid token format");

/**
 * File path validation
 */
export const filePathSchema = z.string().min(1, "File path cannot be empty");

/**
 * Validate and parse environment variables from an object
 */
export function validateEnvVars(vars: Record<string, string>): {
  valid: Record<string, string>;
  invalid: Array<{ key: string; error: string }>;
} {
  const valid: Record<string, string> = {};
  const invalid: Array<{ key: string; error: string }> = [];

  for (const [key, value] of Object.entries(vars)) {
    const keyResult = envKeySchema.safeParse(key);
    const valueResult = envValueSchema.safeParse(value);

    if (!keyResult.success) {
      invalid.push({ key, error: keyResult.error.errors[0].message });
      continue;
    }

    if (!valueResult.success) {
      invalid.push({ key, error: valueResult.error.errors[0].message });
      continue;
    }

    valid[key] = value;
  }

  return { valid, invalid };
}

/**
 * Validate environment name
 */
export function validateEnvironment(
  env: string,
): env is "development" | "staging" | "production" {
  return environmentSchema.safeParse(env).success;
}

/**
 * Validate project slug
 */
export function validateProjectSlug(slug: string): boolean {
  return projectSlugSchema.safeParse(slug).success;
}

/**
 * Validate URL
 */
export function validateUrl(url: string): boolean {
  return urlSchema.safeParse(url).success;
}

/**
 * Validate token
 */
export function validateToken(token: string): boolean {
  return tokenSchema.safeParse(token).success;
}
