import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

/**
 * Strips Convex internal metadata (Request IDs, stack traces, file paths)
 * from error messages so users see clean, human-readable errors.
 */
export function sanitizeConvexError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return (
    raw
      // Strip [Request ID: ...] prefixes
      .replace(/\[Request ID: [^\]]+\]\s*/g, "")
      // Strip "at handler (...)" stack references
      .replace(/\s*at handler \([^)]*\)/g, "")
      // Strip "at ... (file:line:col)" patterns anywhere in the message
      .replace(/\s*at\s+\S+\s+\([^)]*\)/g, "")
      // Strip "Server Error Uncaught Error:" prefix
      .replace(/^(Server Error\s*)?Uncaught Error:\s*/i, "")
      // Strip file paths (Unix and Windows)
      .replace(/\/[\w./-]+\.(ts|js|tsx|jsx)(:\d+:\d+)?/g, "")
      .replace(/\.\.\//g, "")
      // Strip "at handler" without parens
      .replace(/\s*at handler\s*/g, "")
      // Clean up extra whitespace
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Returns true if the error message indicates a tier limit was reached.
 */
export function isTierLimitError(message: string): boolean {
  return (
    message.includes("limit reached") || message.includes("Upgrade to Pro")
  );
}

/**
 * Returns true if the error message indicates an authorization/permission failure
 * thrown by the Convex authz module (convex/authz.ts).
 */
export function isAuthorizationError(message: string): boolean {
  return (
    message.includes("Insufficient permissions") ||
    message.includes("Not a member of this organization") ||
    message.includes("No access to this project") ||
    message.includes("Insufficient project permissions") ||
    // Hierarchy errors from assertCanManageUser: "Cannot remove member: a team_lead cannot manage a admin"
    /^Cannot \w+.*cannot manage/.test(message)
  );
}

/**
 * Report a caught API-route error to Sentry without touching the response.
 * Tier-limit and authorization errors are expected conditions, not bugs,
 * so they are never reported. Use this inside catch blocks that build
 * their own response and would otherwise swallow the error.
 *
 * @param route stable identifier for grouping, e.g. "POST /api/vault/encrypt"
 */
export function reportApiError(
  error: unknown,
  route: string,
  extra?: Record<string, unknown>
): void {
  const message = sanitizeConvexError(error);
  if (isTierLimitError(message) || isAuthorizationError(message)) return;

  const isConvexError =
    error instanceof Error && /\[Request ID:/.test(error.message);
  Sentry.captureException(error, {
    tags: { source: isConvexError ? "convex" : "api-route", route },
    extra: { sanitizedMessage: message, ...extra },
  });
}

/**
 * Standard error response handler for API routes.
 * Automatically sanitizes Convex errors and returns proper status codes
 * for tier-limit errors (403) vs generic errors (500).
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "An unexpected error occurred",
  route?: string
): NextResponse {
  const message = sanitizeConvexError(error) || fallbackMessage;

  if (isTierLimitError(message)) {
    return NextResponse.json(
      { error: message, code: "TIER_LIMIT_REACHED" },
      { status: 403 }
    );
  }

  if (isAuthorizationError(message)) {
    return NextResponse.json(
      { error: message, code: "FORBIDDEN" },
      { status: 403 }
    );
  }

  // Report 500-class errors to Sentry (tier/auth errors are expected, not bugs)
  const isConvexError =
    error instanceof Error && /\[Request ID:/.test(error.message);
  Sentry.captureException(error, {
    tags: {
      source: isConvexError ? "convex" : "api-route",
      ...(route ? { route } : {}),
    },
    extra: { sanitizedMessage: message },
  });

  return NextResponse.json({ error: message }, { status: 500 });
}
