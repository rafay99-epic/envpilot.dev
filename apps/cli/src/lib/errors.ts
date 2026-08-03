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

  // Report unexpected errors to Sentry (skip user-caused errors)
  const skipCodes: Set<string> = new Set([
    ErrorCodes.NOT_AUTHENTICATED,
    ErrorCodes.INVALID_INPUT,
    ErrorCodes.NOT_INITIALIZED,
  ]);

  if (error instanceof CLIError) {
    if (!skipCodes.has(error.code)) {
      captureError(error, { errorCode: error.code });
    }
  } else {
    captureError(error);
  }

  await flushSentry();

  // Exit with error code based on error type
  if (error instanceof CLIError) {
    switch (error.code) {
      case ErrorCodes.NOT_AUTHENTICATED:
        process.exit(2);
        break;
      case ErrorCodes.PERMISSION_DENIED:
        process.exit(3);
        break;
      case ErrorCodes.TIER_LIMIT_EXCEEDED:
        process.exit(4);
        break;
      default:
        process.exit(1);
    }
  }

  process.exit(1);
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

export function projectNotFound(projectId: string): CLIError {
  return new CLIError(
    `Project not found: ${projectId}`,
    ErrorCodes.PROJECT_NOT_FOUND,
    "Run `envpilot list projects` to see available projects."
  );
}

export function organizationNotFound(organizationId: string): CLIError {
  return new CLIError(
    `Organization not found: ${organizationId}`,
    ErrorCodes.ORGANIZATION_NOT_FOUND,
    "Run `envpilot list organizations` to see available organizations."
  );
}

export function tierLimitExceeded(feature: string): CLIError {
  return new CLIError(
    `Tier limit reached: ${feature}`,
    ErrorCodes.TIER_LIMIT_EXCEEDED,
    "Run `envpilot usage` to see your current plan limits, or upgrade to Pro."
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

export function networkError(message: string): CLIError {
  return new CLIError(
    `Network error: ${message}`,
    ErrorCodes.NETWORK_ERROR,
    "Check your internet connection and try again."
  );
}
