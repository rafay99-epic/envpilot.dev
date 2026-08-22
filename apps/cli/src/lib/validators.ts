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
    "Key must start with a letter or underscore, followed by letters, numbers, or underscores"
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

type Environment = z.infer<typeof environmentSchema>;

/**
 * Project slug validation
 */
export const projectSlugSchema = z
  .string()
  .min(1, "Slug cannot be empty")
  .max(128, "Slug cannot exceed 128 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/,
    "Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen"
  );

/**
 * URL validation
 */
export const urlSchema = z.url({ message: "Must be a valid URL" });

/**
 * Token validation
 */
export const tokenSchema = z
  .string()
  .min(1, "Token cannot be empty")
  .regex(/^env_[A-Za-z0-9]{48}$/, "Invalid token format");

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
      invalid.push({ key, error: keyResult.error.issues[0].message });
      continue;
    }

    if (!valueResult.success) {
      invalid.push({ key, error: valueResult.error.issues[0].message });
      continue;
    }

    valid[key] = value;
  }

  return { valid, invalid };
}

/**
 * Shorthand people actually type. Rejecting `-e prod` taught users the tool
 * was fussy rather than that they had made a mistake.
 */
const ENVIRONMENT_ALIASES: Record<string, Environment> = {
  dev: "development",
  develop: "development",
  local: "development",
  stage: "staging",
  staging: "staging",
  prod: "production",
  production: "production",
  development: "development",
};

/**
 * Resolve a user-supplied environment name to its canonical form, or null
 * when it is not an environment at all. Case-insensitive.
 */
export function resolveEnvironment(env: string): Environment | null {
  return ENVIRONMENT_ALIASES[env.trim().toLowerCase()] ?? null;
}

/** The canonical environment names, for error messages and help text. */
export const ENVIRONMENTS = ["development", "staging", "production"] as const;

/**
 * Validate environment name. Accepts aliases, so this is a guard on the
 * INPUT rather than on the canonical value — call resolveEnvironment to get
 * the value itself.
 */
export function validateEnvironment(env: string): boolean {
  return resolveEnvironment(env) !== null;
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
