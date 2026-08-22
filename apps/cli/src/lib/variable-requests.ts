// Pure helpers for the `envpilot request` / `envpilot requests` commands.
//
// Kept separate from the command files (which own prompting/IO) so the
// validation and scope-filtering logic can be unit tested without mocking
// inquirer or the network.

import { z } from "zod";
import type { VariableRequest, VariableRequestStatus } from "../types/index.js";
import { normalizeOrgRole } from "./roles.js";

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
 * Environments a developer may choose from, given their environmentScope.
 * null/undefined = unrestricted — offer all three. An explicit empty array
 * means the assignment grants NO environments: the server's subset check
 * (isEnvironmentScopeAllowed) rejects every environment for [], and the
 * VS Code extension exits early on it — the CLI must mirror that instead of
 * offering everything and letting the submit 403.
 */
export function allowedRequestEnvironments(
  environmentScope: string[] | null | undefined
): RequestEnvironment[] {
  if (environmentScope == null) {
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

// ── Target resolution & display (the unified request-targeting UX) ────
//
// `envpilot request` must always show WHICH project/org a request targets and
// let a developer switch to any project they're an assigned developer on. The
// pure pieces of that flow (eligibility, choice labelling, banner/summary
// formatting) live here so they can be unit tested without inquirer/network.

/**
 * The subset of a `/api/cli/projects` entry the request flow reasons about.
 * Mirrors the additive unified fields that route returns (unifiedRole is the
 * caller's ORG role; assigned/environmentScope are per-project).
 */
export interface RequestProjectCandidate {
  _id: string;
  name: string;
  organizationId: string;
  unifiedRole?: string | null;
  role?: string | null;
  assigned?: boolean;
  environmentScope?: string[] | null;
  /** Resolved capability map (additive server field; absent on older servers). */
  capabilities?: Record<string, boolean> | null;
}

/** A resolved request target with the display names the banner/summary need. */
export interface RequestTarget {
  projectId: string;
  projectName: string;
  organizationId: string;
  organizationName: string;
  environmentScope?: string[] | null;
}

/**
 * Whether the caller may submit variable requests. Capability-driven when the
 * server sent a capability map (registry roles, including custom ones);
 * otherwise falls back to the legacy rule: only developers submit requests
 * (owners, project managers, and team leads create variables directly).
 */
export function canSubmitRequests(input: {
  capabilities?: Record<string, boolean> | null;
  role?: string | null;
}): boolean {
  if (input.capabilities) {
    return input.capabilities["project.requests.submit"] === true;
  }
  return normalizeOrgRole(input.role) === "developer";
}

/**
 * A project is request-eligible when the caller is assigned to it and may
 * submit requests (see {@link canSubmitRequests}). The `/api/cli/projects`
 * route only returns assigned projects to non-owners, but we check `assigned`
 * explicitly so a stray unassigned entry can never leak into the picker.
 */
export function isRequestEligibleProject(
  project: Pick<
    RequestProjectCandidate,
    "unifiedRole" | "role" | "assigned" | "capabilities"
  >
): boolean {
  return (
    canSubmitRequests({
      capabilities: project.capabilities,
      role: project.unifiedRole ?? project.role,
    }) && project.assigned === true
  );
}

/**
 * Filter a project list to the request-eligible ones and shape them into
 * `RequestTarget`s, resolving each project's org display name from the supplied
 * id→name map (falling back to the raw org id when unknown).
 */
export function buildEligibleRequestTargets(
  projects: RequestProjectCandidate[],
  orgNameById: Record<string, string>
): RequestTarget[] {
  const targets: RequestTarget[] = [];
  for (const project of projects) {
    if (!isRequestEligibleProject(project)) continue;
    targets.push({
      projectId: project._id,
      projectName: project.name,
      organizationId: project.organizationId,
      organizationName:
        orgNameById[project.organizationId] ?? project.organizationId,
      environmentScope: project.environmentScope ?? null,
    });
  }
  return targets;
}

/** Label a target for a picker / summary as "<project> — <org>". */
export function formatProjectChoiceLabel(
  target: Pick<RequestTarget, "projectName" | "organizationName">
): string {
  return `${target.projectName} — ${target.organizationName}`;
}

/** Build inquirer `list` choices (value = projectId) from eligible targets. */
export function buildProjectChoices(
  targets: RequestTarget[]
): Array<{ name: string; value: string }> {
  return targets.map((t) => ({
    name: formatProjectChoiceLabel(t),
    value: t.projectId,
  }));
}

/**
 * The always-printed context banner shown before any prompt so the developer
 * can see exactly who they are and which project/org the request targets.
 */
export function formatRequestContextBanner(input: {
  email: string;
  projectName: string;
  organizationName: string;
}): string {
  return (
    `Requesting as ${input.email}\n` +
    `Project: ${input.projectName}  ·  Organization: ${input.organizationName}`
  );
}

/** Pad a summary label to a fixed column so values line up. */
const SUMMARY_LABEL_WIDTH = 15;

/**
 * The final confirmation summary printed before submit. Labels are padded to a
 * fixed column so the values align:
 *
 *   Key:           API_KEY
 *   Project:       my-app — Acme
 *   Environments:  development, staging
 *   Sensitive:     no
 */
export function formatRequestSummary(input: {
  key: string;
  projectName: string;
  organizationName: string;
  environments: string[];
  isSensitive: boolean;
}): string {
  const rows: Array<[string, string]> = [
    ["Key:", input.key],
    [
      "Project:",
      formatProjectChoiceLabel({
        projectName: input.projectName,
        organizationName: input.organizationName,
      }),
    ],
    ["Environments:", input.environments.join(", ")],
    ["Sensitive:", input.isSensitive ? "yes" : "no"],
  ];
  return rows
    .map(([label, value]) => `${label.padEnd(SUMMARY_LABEL_WIDTH)}${value}`)
    .join("\n");
}

/** The success line shown after a request is submitted (checkmark added by the caller). */
export function formatRequestSuccessMessage(input: {
  key: string;
  projectName: string;
  organizationName: string;
}): string {
  return `Request "${input.key}" submitted for ${input.projectName} (${input.organizationName}) — pending review.`;
}

/** Header for the `envpilot requests` listing, naming the project it lists. */
export function formatRequestsListHeader(input: {
  projectName: string;
  organizationName: string;
}): string {
  return `Requests for ${formatProjectChoiceLabel(input)}`;
}

/**
 * Row shape for the `envpilot requests` table renderer. Includes an index
 * signature so it satisfies `ui.ts`'s generic `table()` helper, which takes
 * `Record<string, string | number | boolean | undefined>[]`.
 */
export interface VariableRequestRow {
  id: string;
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
    "_id" | "key" | "environments" | "status" | "createdAt" | "reviewReason"
  >
): VariableRequestRow {
  return {
    id: request._id,
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
      "_id" | "key" | "environments" | "status" | "createdAt" | "reviewReason"
    >
  >
): VariableRequestRow[] {
  return requests.map(formatRequestRow);
}
