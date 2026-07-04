/**
 * Error-message helpers safe to import from BOTH server and client code.
 * (api-errors.ts re-exports these for server callers; client code — toasts,
 * the Convex error bridge — imports from here directly since api-errors.ts
 * pulls in next/server.)
 */

/**
 * Strips Convex internal metadata (Request IDs, stack traces, file paths)
 * from error messages so users see clean, human-readable errors.
 */
export function sanitizeConvexError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "An unexpected error occurred";
  return (
    raw
      // Strip [CONVEX M(path)] / [CONVEX A(path)] client-log prefixes
      .replace(/\[CONVEX [MAQ]\([^)]*\)\]\s*/g, "")
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
 * Returns true if the error message indicates an authorization/permission
 * failure thrown by the Convex authz module (convex/authz.ts).
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
