// Pure helpers for the `envpilot request` / `envpilot requests` commands.
//
// Kept separate from the command files (which own prompting/IO) so the
// validation and scope-filtering logic can be unit tested without mocking
// inquirer or the network.

import { z } from "zod";
import type { VariableRequest, VariableRequestStatus } from "../types/index.js";

/** Mirrors the server's createRequestSchema (apps/web .../cli/variable-requests). */
export const ALL_REQUEST_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;
export type RequestEnvironment = (typeof ALL_REQUEST_ENVIRONMENTS)[number];

export const requestKeySchema = z
  .string()
  .min(1, "Key is required")
  .max(100, "Key must be 100 characters or less")
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Key must be uppercase, start with a letter, and contain only letters, numbers, and underscores"
  );

export const requestValueSchema = z.string().min(1, "Value is required");

export const requestDescriptionSchema = z
  .string()
  .max(500, "Description must be 500 characters or less");

export interface CreateVariableRequestBody {
  projectId: string;
  key: string;
  value: string;
  description?: string;
  environments: RequestEnvironment[];
  isSensitive?: boolean;
}

/**
 * Validate a candidate variable request key. Returns `{ valid: true }` or
 * `{ valid: false, error }` — shaped for direct use as an inquirer `validate`
 * callback (`(input) => validateRequestKey(input).valid || validateRequestKey(input).error`).
 */
export function validateRequestKey(
  key: string
): { valid: true } | { valid: false; error: string } {
  const result = requestKeySchema.safeParse(key);
  if (result.success) return { valid: true };
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "Invalid key",
  };
}

export function validateRequestValue(
  value: string
): { valid: true } | { valid: false; error: string } {
  const result = requestValueSchema.safeParse(value);
  if (result.success) return { valid: true };
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "Invalid value",
  };
}

export function validateRequestDescription(
  description: string
): { valid: true } | { valid: false; error: string } {
  if (description.length === 0) return { valid: true };
  const result = requestDescriptionSchema.safeParse(description);
  if (result.success) return { valid: true };
  return {
    valid: false,
    error: result.error.issues[0]?.message ?? "Invalid description",
  };
}

/**
 * Environments a developer may choose from, given their environmentScope
 * from the /api/cli/variables meta block. A null/undefined/empty scope means
 * unrestricted access — offer all three environments.
 */
export function allowedRequestEnvironments(
  environmentScope: string[] | null | undefined
): RequestEnvironment[] {
  if (!environmentScope || environmentScope.length === 0) {
    return [...ALL_REQUEST_ENVIRONMENTS];
  }
  return ALL_REQUEST_ENVIRONMENTS.filter((env) =>
    environmentScope.includes(env)
  );
}

/**
 * Build the exact POST body the server's zod schema expects, trimming and
 * defaulting optional fields the same way the API route does.
 */
export function buildCreateVariableRequestBody(input: {
  projectId: string;
  key: string;
  value: string;
  description?: string;
  environments: string[];
  isSensitive?: boolean;
}): CreateVariableRequestBody {
  const description = input.description?.trim();
  return {
    projectId: input.projectId,
    key: input.key.trim(),
    value: input.value,
    ...(description ? { description } : {}),
    environments: input.environments as RequestEnvironment[],
    isSensitive: input.isSensitive ?? false,
  };
}

/**
 * Row shape for the `envpilot requests` table renderer. Includes an index
 * signature so it satisfies `ui.ts`'s generic `table()` helper, which takes
 * `Record<string, string | number | boolean | undefined>[]`.
 */
export interface VariableRequestRow {
  key: string;
  environments: string;
  status: VariableRequestStatus;
  requested: string;
  reason: string;
  [key: string]: string | number | boolean | undefined;
}

export function formatRequestRow(
  request: Pick<
    VariableRequest,
    "key" | "environments" | "status" | "createdAt" | "reviewReason"
  >
): VariableRequestRow {
  return {
    key: request.key,
    environments: request.environments.join(", "),
    status: request.status,
    requested: new Date(request.createdAt).toLocaleDateString(),
    reason: request.reviewReason ?? "",
  };
}

export function formatRequestRows(
  requests: Array<
    Pick<
      VariableRequest,
      "key" | "environments" | "status" | "createdAt" | "reviewReason"
    >
  >
): VariableRequestRow[] {
  return requests.map(formatRequestRow);
}
