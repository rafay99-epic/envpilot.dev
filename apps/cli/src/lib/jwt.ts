// Minimal, dependency-free JWT reader.
//
// The CLI never VERIFIES WorkOS access tokens locally (verification happens
// server-side against the WorkOS JWKS on the surviving vault route and inside
// Convex). It only needs to READ two unverified claims from its own freshly
// obtained token: `exp` (to decide when to refresh) and `sid` (the WorkOS
// session id, recorded so the session shows up in the active-sessions UI).
//
// Decoding without verifying is safe here because the token came straight from
// WorkOS over TLS and is only used to schedule a refresh / label a session —
// never to make an authorization decision.

/** Decode a JWT payload (middle segment) into a plain object, or null. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1]!;
    // base64url → base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf-8");
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/** Read the `exp` claim (seconds since epoch), or null when absent/unparseable. */
export function getJwtExp(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.exp;
  return typeof exp === "number" ? exp : null;
}

/** Read the WorkOS session id (`sid` claim), or null. */
export function getJwtSessionId(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const sid = payload?.sid;
  return typeof sid === "string" ? sid : null;
}

/**
 * Whether a token is expired or within `skewSeconds` of expiring. WorkOS access
 * tokens live 5 minutes; we refresh with 60s of headroom so a token never
 * expires mid-request. Tokens with no readable `exp` are treated as expiring
 * (forces a refresh) rather than assumed valid.
 */
export function isTokenExpiring(token: string, skewSeconds = 60): boolean {
  const exp = getJwtExp(token);
  if (exp === null) return true;
  const nowSeconds = Date.now() / 1000;
  return exp - nowSeconds <= skewSeconds;
}
