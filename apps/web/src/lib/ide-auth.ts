import "server-only";

import { convex } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type IdeSession = {
  token: string;
  userId: Id<"users">;
};

function decodeJwtSubject(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the caller's session from a WorkOS Bearer token (device-flow clients
 * such as the JetBrains plugin). The token signature is NOT verified here —
 * Convex verifies it against the WorkOS JWKS on every authed call that uses
 * it. This helper only locates the local users row.
 */
export async function ideAuth(request: Request): Promise<IdeSession | null> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;

  const workosId = decodeJwtSubject(token);
  if (!workosId) return null;

  const user = await convex.query(api.features.users.users.getByWorkosId, {
    workosId,
  });
  if (!user) return null;
  return { token, userId: user._id };
}

/** True when a thrown Convex error means the Bearer token was rejected. */
export function isConvexAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /unauthenticated|not authenticated|invalid authorization|missing authorization/i.test(
    message
  );
}
