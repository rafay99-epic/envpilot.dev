/**
 * Shared plumbing for the public REST API v1 routes
 * (apps/web/src/app/api/v1/**). Every route is a thin HTTP shell around a
 * Convex action in convex/features/api/reads.ts, which is itself a thin
 * shell around the ONE enforcement core (`_authorizeRequest`,
 * convex/features/api/authorize.ts). This module centralizes the three bits
 * every one of those routes needs identically: pulling the bearer token,
 * resolving the Convex URL (loud config failure), and mapping the action's
 * thrown error strings onto the uniform `{ error, code }` HTTP shape + the
 * exact status codes from PLAN §2 (401/403/404/422/429+Retry-After/503) —
 * the same regex-on-message-text convention apps/web/src/app/api/v1/secrets/route.ts
 * already uses for the CI/CD pull surface.
 */

import { sanitizeConvexError } from "@/lib/error-messages";

/** Extract the bearer credential from an Authorization header, or null. */
/**
 * Parse the metadata-only flag.
 *
 * Two routes spelled it `metadata_only` and accepted only the literal
 * "true"; a third spelled it `metadataOnly` and accepted "1" or "true", so
 * `?metadata_only=1` parsed as false and then 400d asking for an
 * environment. Both spellings and the usual truthy words work everywhere now.
 */
export function parseMetadataOnly(
  params: URLSearchParams
): boolean | undefined {
  const raw = params.get("metadata_only") ?? params.get("metadataOnly");
  if (raw === null) return undefined;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

/**
 * The bearer token, or null.
 *
 * The scheme is matched case insensitively: RFC 7235 defines it that way, and
 * a client sending `bearer envpk_...` used to get 401 MISSING_TOKEN and
 * conclude its key was bad.
 */
export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^bearer\s+(.+)$/i.exec(authorization.trim());
  const token = match?.[1]?.trim();
  return token || null;
}

/** The Convex deployment URL, or null if unconfigured (a 503, not a crash). */
export function getConvexUrl(): string | null {
  return process.env.NEXT_PUBLIC_CONVEX_URL ?? null;
}

export interface MappedPublicApiError {
  status: number;
  code: string;
  message: string;
  /** Set only for 429s — the route mirrors this into a `Retry-After` header. */
  retryAfterSeconds?: number;
  /**
   * Set for the two loud-failure classes that mean an integration is broken
   * RIGHT NOW (vault-decrypt, overflow) — Sentry.captureException with this
   * tag. Undefined for expected 4xx client errors (never reported) and for
   * truly unknown errors (reported generically via reportApiError instead).
   */
  sentryFailureTag?: "vault-decrypt" | "overflow";
}

/**
 * Map a caught error's message onto the uniform REST error shape. Mirrors
 * the exact phrases convex/features/api/reads.ts throws (kept in lockstep —
 * see that file's `throwForDenial` and per-action loud-failure messages).
 */
export function mapPublicApiError(error: unknown): MappedPublicApiError {
  // The actions throw ConvexError so the message survives prod redaction
  // (a plain Error becomes "[Request ID] Server Error" and every denial
  // would map to 500). sanitizeConvexError unwraps the payload.
  const message =
    error instanceof Error ? sanitizeConvexError(error) : "Request failed";

  if (/invalid or revoked/i.test(message)) {
    return {
      status: 401,
      code: "INVALID_KEY",
      message: "Invalid or revoked API key",
    };
  }
  if (/not in this api key.?s scope/i.test(message)) {
    return { status: 403, code: "FORBIDDEN_SCOPE", message };
  }
  if (/not enabled for this surface/i.test(message)) {
    return { status: 403, code: "FORBIDDEN_SURFACE", message };
  }
  // Both wordings: the surface gates stopped saying "Pro plan" when they
  // moved onto the free tier, and an older Convex deployment can still be
  // sending the previous text.
  if (/pro plan|not available on this plan/i.test(message)) {
    return { status: 403, code: "TIER_GATE", message };
  }
  if (/project not found/i.test(message)) {
    return { status: 404, code: "NOT_FOUND", message: "Project not found" };
  }
  // Rare but real: the org was deleted while a key survived — a clear 404,
  // not an opaque INTERNAL_ERROR 500.
  if (/organization not found/i.test(message)) {
    return {
      status: 404,
      code: "NOT_FOUND",
      message: "Organization not found",
    };
  }
  if (/missing required param/i.test(message)) {
    return { status: 400, code: "VALIDATION_ERROR", message };
  }
  if (/rate limit exceeded/i.test(message)) {
    const match = /retry after (\d+)ms/i.exec(message);
    const retryAfterMs = match ? Number(match[1]) : 60_000;
    return {
      status: 429,
      code: "RATE_LIMITED",
      message: "Rate limit exceeded — retry shortly",
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }
  if (/failed to decrypt/i.test(message)) {
    return {
      status: 503,
      code: "DECRYPT_FAILED",
      message,
      sentryFailureTag: "vault-decrypt",
    };
  }
  if (/refusing a partial pull/i.test(message)) {
    return {
      status: 422,
      code: "OVERFLOW",
      message,
      sentryFailureTag: "overflow",
    };
  }

  return { status: 500, code: "INTERNAL_ERROR", message: "Request failed" };
}
