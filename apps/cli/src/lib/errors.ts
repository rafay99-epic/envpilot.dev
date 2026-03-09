import chalk from "chalk";

/**
 * Custom error class for CLI errors
 */
export class CLIError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string,
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
 * Handle errors and exit with appropriate code
 */
export function handleError(error: unknown): never {
  console.error(formatError(error));

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
    "Run `env-connect login` to authenticate.",
  );
}

export function notInitialized(): CLIError {
  return new CLIError(
    "This directory is not initialized with ENV Connect.",
    ErrorCodes.NOT_INITIALIZED,
    "Run `env-connect init` to initialize.",
  );
}

export function projectNotFound(projectId: string): CLIError {
  return new CLIError(
    `Project not found: ${projectId}`,
    ErrorCodes.PROJECT_NOT_FOUND,
    "Run `env-connect list projects` to see available projects.",
  );
}

export function organizationNotFound(organizationId: string): CLIError {
  return new CLIError(
    `Organization not found: ${organizationId}`,
    ErrorCodes.ORGANIZATION_NOT_FOUND,
    "Run `env-connect list organizations` to see available organizations.",
  );
}

export function tierLimitExceeded(feature: string): CLIError {
  return new CLIError(
    `This feature is currently unavailable: ${feature}`,
    ErrorCodes.TIER_LIMIT_EXCEEDED,
    "Please try again later.",
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
    "Check your internet connection and try again.",
  );
}
