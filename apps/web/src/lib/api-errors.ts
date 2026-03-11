import { NextResponse } from "next/server";

/**
 * Strips Convex internal metadata (Request IDs, stack traces, file paths)
 * from error messages so users see clean, human-readable errors.
 */
export function sanitizeConvexError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return raw
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
    .trim();
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
 * Standard error response handler for API routes.
 * Automatically sanitizes Convex errors and returns proper status codes
 * for tier-limit errors (403) vs generic errors (500).
 */
export function handleApiError(
  error: unknown,
  fallbackMessage = "An unexpected error occurred"
): NextResponse {
  const message = sanitizeConvexError(error) || fallbackMessage;

  if (isTierLimitError(message)) {
    return NextResponse.json(
      { error: message, code: "TIER_LIMIT_REACHED" },
      { status: 403 }
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
