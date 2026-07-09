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
 *
 * Must cover every wording the backend actually throws — matched
 * case-insensitively because the sources differ in casing:
 * - `checkNumericLimit`/`checkCountedLimit`: "Limit reached (n/m). Upgrade
 *   your tier for more." (convex/featureRegistry.ts)
 * - `checkBooleanFeature`: "<feature> requires a higher tier."
 * - Legacy REST copy: "... Upgrade to Pro ..."
 */
export function isTierLimitError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("limit reached") ||
    normalized.includes("upgrade your tier") ||
    normalized.includes("upgrade to pro") ||
    normalized.includes("requires a higher tier")
  );
}

/**
 * Returns true for uniqueness/duplicate validation conflicts (e.g.
 * "Variable key already exists in this project") — user-correctable input
 * the UI surfaces inline, not a defect worth a Sentry issue.
 */
export function isConflictError(message: string): boolean {
  return /already exists/i.test(message);
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
