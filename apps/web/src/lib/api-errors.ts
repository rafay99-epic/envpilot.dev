import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import {
  sanitizeConvexError,
  isTierLimitError,
  isAuthorizationError,
} from "./error-messages";

// Client-safe helpers live in ./error-messages (this module pulls in
// next/server); re-exported here so existing server callers keep working.
export { sanitizeConvexError, isTierLimitError, isAuthorizationError };

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
