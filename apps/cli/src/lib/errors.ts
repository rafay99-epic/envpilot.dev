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
 * Format an error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof CLIError) {
    let message = chalk.red(`Error: ${error.message}`);
    if (error.suggestion) {
      message += `\n${chalk.yellow("Suggestion:")} ${error.suggestion}`;
    }
    return message;
  }

  if (error instanceof Error) {
    return chalk.red(`Error: ${error.message}`);
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
      case ErrorCodes.PERMISSION_DENIED:
        process.exit(3);
      case ErrorCodes.TIER_LIMIT_EXCEEDED:
        process.exit(4);
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

export function networkError(message: string): CLIError {
  return new CLIError(
    `Network error: ${message}`,
    ErrorCodes.NETWORK_ERROR,
    "Check your internet connection and try again."
  );
}
