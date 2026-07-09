/**
 * Classify whether an error is auth-related so error boundaries can show the
 * dedicated auth error page (sign-in prompt, support contact) instead of the
 * generic terminal error.
 *
 * Matching is deliberately phrase-based, not bare-substring — naive checks
 * like `includes("token")` misclassify the extremely common
 * "Unexpected token < in JSON" fetch failure as an auth error, and
 * `includes("auth")` matches "author". Only add patterns here that cannot
 * appear in ordinary non-auth error text.
 */
const AUTH_ERROR_PATTERN = new RegExp(
  [
    "unauthorized",
    "unauthenticated",
    "not authenticated",
    "forbidden",
    "authentication",
    "auth provider",
    "workos",
    "\\bsign in\\b",
    "\\bjwt\\b",
    "(?:access|refresh|id|bearer|auth)[ _-]token",
    "token (?:expired|invalid|revoked|has expired|is invalid)",
    "(?:invalid|expired|missing|revoked) token",
    "session (?:expired|invalid|not found|has expired)",
    "(?:invalid|expired|missing) session",
    "\\b40[13]\\b",
  ].join("|"),
  "i"
);

export function isAuthError(error: Error & { digest?: string }): boolean {
  return (
    AUTH_ERROR_PATTERN.test(error.message) ||
    AUTH_ERROR_PATTERN.test(error.name)
  );
}
