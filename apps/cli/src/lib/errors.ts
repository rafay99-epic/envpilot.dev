import chalk from "chalk";
import { captureError, flushSentry } from "./sentry.js";

/**
 * Custom error class for CLI errors
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string
  ) {
    super(message);
    this.name = "CLIError";
  }
}

/**
 * Error codes and their corresponding messages
 */
export const ErrorCodes = {
  NOT_AUTHENTICATED: "NOT_AUTHENTICATED",
  NOT_INITIALIZED: "NOT_INITIALIZED",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND",
  VARIABLE_NOT_FOUND: "VARIABLE_NOT_FOUND",
  INVALID_CONFIG: "INVALID_CONFIG",
  NETWORK_ERROR: "NETWORK_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  TIER_LIMIT_EXCEEDED: "TIER_LIMIT_EXCEEDED",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  INVALID_INPUT: "INVALID_INPUT",
  INCOMPLETE_SECRETS: "INCOMPLETE_SECRETS",
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

/**
 * Server token marking an org-wide access revocation (security hold /
 * membership removed). The backend throws it from the authz choke point; we
 * translate it to a plain "contact your organization" message rather than
 * leaking the raw guard string. See convex/lib/authz.ts.
 */
const ACCESS_SUSPENDED_TOKEN = "ACCESS_SUSPENDED";
const ACCESS_REVOKED_MESSAGE =
  "Your access to this organization has been revoked. Please contact your organization administrator.";
const EXPECTED_ERROR_CODES = new Set([
  ErrorCodes.NOT_AUTHENTICATED,
  ErrorCodes.INVALID_INPUT,
  ErrorCodes.NOT_INITIALIZED,
  "SESSION_EXPIRED",
]);
const SAFE_TELEMETRY_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  return typeof error.code === "string" && SAFE_TELEMETRY_CODE.test(error.code)
    ? error.code
    : undefined;
}

function telemetryTags(error: unknown): Record<string, string> {
  const tags: Record<string, string> = {};
  if (error instanceof Error) tags.errorType = error.name;

  const code = errorCode(error);
  if (code) tags.errorCode = code;

  if (error instanceof Error && "statusCode" in error) {
    const statusCode = error.statusCode;
    if (typeof statusCode === "number" && Number.isFinite(statusCode)) {
      tags.statusCode = String(statusCode);
    }
  }
  return tags;
}

function exitCode(error: unknown): number {
  switch (errorCode(error)) {
    case ErrorCodes.NOT_AUTHENTICATED:
    case "SESSION_EXPIRED":
      return 2;
    case ErrorCodes.PERMISSION_DENIED:
      return 3;
    case ErrorCodes.TIER_LIMIT_EXCEEDED:
      return 4;
    case ErrorCodes.INCOMPLETE_SECRETS:
      return 5;
    default:
      return 1;
  }
}

/**
 * Reduce a Convex error to the single user-facing sentence it carries.
 *
 * A ConvexError thrown inside an action arrives at the CLI wrapped in the
 * deployment's diagnostics: a request id, one or more "Uncaught ConvexError:"
 * layers (an action re-throwing a mutation's error double-wraps it), and a
 * source stack. Printing `error.message` raw dumped all of that at the user.
 *
 * Mirrors sanitizeConvexError in apps/web/src/lib/error-messages.ts — the two
 * surfaces must show the same sentence for the same failure.
 */
export function sanitizeConvexError(error: unknown): string {
  // In production the plain message is redacted to "Server Error" and only the
  // ConvexError payload survives, so prefer it when present.
  const data = (error as { data?: unknown })?.data;
  if (typeof data === "string" && data.trim().length > 0) {
    return data.trim();
  }

  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "An unexpected error occurred";

  return (
    raw
      .replace(/\[CONVEX [MAQ]\([^)]*\)\]\s*/g, "")
      .replace(/\[Request ID: [^\]]+\]\s*/g, "")
      .replace(/\s*at\s+\S+\s+\([^)]*\)/g, "")
      .replace(/^(Server Error\s*)?(Uncaught (Convex)?Error:\s*)+/i, "")
      .replace(/\/[\w./-]+\.(ts|js|tsx|jsx)(:\d+:\d+)?/g, "")
      .replace(/\.\.\//g, "")
      .replace(/\s*at handler\s*/g, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "An unexpected error occurred"
  );
}

/**
 * Format an error for display
 */
export function formatError(error: unknown): string {
  // ConvexError carries its payload on `.data` (the message body is redacted
  // in prod deployments) — check both.
  const data = (error as { data?: unknown })?.data;
  const raw = [
    error instanceof Error ? error.message : error ? String(error) : "",
    typeof data === "string" ? data : "",
  ].join(" ");
  if (raw.includes(ACCESS_SUSPENDED_TOKEN)) {
    return chalk.red(`Error: ${ACCESS_REVOKED_MESSAGE}`);
  }

  if (error instanceof CLIError) {
    let message = chalk.red(`Error: ${error.message}`);
    if (error.suggestion) {
      message += `\n${chalk.yellow("Suggestion:")} ${error.suggestion}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return chalk.red(`Error: ${sanitizeConvexError(error)}`);
  }

  return chalk.red(`Error: ${String(error)}`);
}

/**
 * Handle errors, report to Sentry, and exit with appropriate code.
 * Skips Sentry reporting for user-caused errors (auth, input, init).
 */
export async function handleError(error: unknown): Promise<never> {
  console.error(formatError(error));

  const code = errorCode(error);
  if (!code || !EXPECTED_ERROR_CODES.has(code)) {
    captureError(error, telemetryTags(error));
  }

  await flushSentry();
  process.exit(exitCode(error));
}

/**
 * Create common errors
 */
export function notAuthenticated(): CLIError {
  return new CLIError(
    "You are not authenticated.",
    ErrorCodes.NOT_AUTHENTICATED,
    "Run `envpilot login` to authenticate."
  );
}

export function notInitialized(): CLIError {
  return new CLIError(
    "This directory is not initialized with Envpilot.",
    ErrorCodes.NOT_INITIALIZED,
    "Run `envpilot init` to initialize."
  );
}

export function fileNotFound(path: string): CLIError {
  return new CLIError(`File not found: ${path}`, ErrorCodes.FILE_NOT_FOUND);
}

export function invalidInput(message: string): CLIError {
  return new CLIError(message, ErrorCodes.INVALID_INPUT);
}

/**
 * True when an error is a CONNECTIVITY failure (offline, DNS, timeout) as
 * opposed to a server-side response (denial, 4xx/5xx). Used to decide
 * fail-open vs fail-closed: offline caches may be served on connectivity
 * failures, but NEVER when the server answered with a denial (access
 * suspended/revoked, membership gone).
 */
export function isConnectivityError(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  if (
    [
      "ECONNREFUSED",
      "ECONNRESET",
      "ENOTFOUND",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "UND_ERR_CONNECT_TIMEOUT",
    ].includes(code)
  ) {
    return true;
  }
  // An error that carries an HTTP status is a server RESPONSE, not a
  // connectivity failure.
  if ((error as { status?: number })?.status !== undefined) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|socket hang up|getaddrinfo|connect timeout/i.test(
    message
  );
}

/**
 * The resolved secret set cannot be trusted to boot an app: keys failed to
 * decrypt, the server capped its read, or a declared requirement is missing.
 *
 * `run` throws this INSTEAD of spawning. Continuing with a short set is what
 * turned a clear failure into an obscure one somewhere downstream, which is
 * the whole reason this error exists.
 */
export function incompleteSecrets(reasons: readonly string[]): CLIError {
  return new CLIError(
    `Refusing to run with an incomplete environment:\n  ${reasons.join("\n  ")}`,
    ErrorCodes.INCOMPLETE_SECRETS,
    "Fix the variables above, or pass --allow-partial to run anyway."
  );
}
