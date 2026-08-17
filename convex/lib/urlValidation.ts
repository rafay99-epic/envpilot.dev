/**
 * Scheme validation for user-supplied URLs that get rendered as links.
 *
 * Lives here, with no Convex imports, for two reasons: the rule is pure, and
 * a module that pulls in `_generated/server` cannot be unit-tested without
 * mocking half of Next.js (which is what the previous version of this test
 * had to do).
 *
 * This used to be a zod rule on POST /api/accounts. That route is gone now
 * that the browser calls Convex directly, so this is the only server-side
 * check left. `websiteUrl` is rendered as an href in the account list, and
 * `javascript:` in an href is stored XSS. The list item also guards with
 * isSafeHttpUrl, but a client-side guard is a display decision, not a
 * validation boundary.
 */

export const MAX_URL_LENGTH = 2048;

export type UrlValidationError =
  | { kind: "too-long" }
  | { kind: "bad-scheme" }
  | { kind: "malformed" };

/**
 * `undefined` and `""` are valid: callers use the empty string to CLEAR an
 * optional field. Returns null when acceptable, otherwise the reason.
 */
export function validateHttpUrl(
  value: string | undefined
): UrlValidationError | null {
  if (value === undefined || value === "") return null;
  if (value.length > MAX_URL_LENGTH) return { kind: "too-long" };
  // Checked before parsing: `new URL("javascript:alert(1)")` succeeds.
  if (!/^https?:\/\//i.test(value)) return { kind: "bad-scheme" };
  try {
    new URL(value);
  } catch {
    return { kind: "malformed" };
  }
  return null;
}

export function urlValidationMessage(error: UrlValidationError): string {
  switch (error.kind) {
    case "too-long":
      return `Website URL must be ${MAX_URL_LENGTH} characters or less`;
    case "bad-scheme":
      return "Website URL must start with http:// or https://";
    case "malformed":
      return "Invalid URL";
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
