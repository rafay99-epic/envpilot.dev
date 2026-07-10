import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@workos-inc/authkit-nextjs";
import * as Sentry from "@sentry/nextjs";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";

/**
 * GET /api/vault?vaultRef=xxx — reveal a single decrypted secret value.
 *
 * Stage 3 moved vault crypto into Convex. This route is now a thin,
 * session-authenticated entrypoint for the browser reveal path (the eye icon on
 * variables/accounts and the diff view): it forwards the caller's WorkOS JWT to
 * the identity-scoped `vaultReveal.reveal` action, which authorizes by resource
 * access before reading. No secret crypto happens here; Convex is the backend.
 *
 * The response shape ({ success, data: { value } }) is preserved for the
 * existing frontend callers. `organizationId` is still accepted in the query
 * for backward compatibility but is ignored — authorization is by the resource
 * that owns the ref, not a client-supplied org.
 */
export async function GET(request: NextRequest) {
  let user;
  let accessToken;
  try {
    ({ user, accessToken } = await withAuth({ ensureSignedIn: true }));
  } catch {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }
  if (!user || !accessToken) {
    return NextResponse.json(
      { error: "Authentication required", code: "UNAUTHORIZED" },
      { status: 401 }
    );
  }

  const vaultRef = new URL(request.url).searchParams.get("vaultRef");
  if (!vaultRef) {
    return NextResponse.json(
      { error: "Invalid request", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  try {
    const { value } = await createAuthedConvexClient(accessToken).action(
      api.features.vault.reveal.reveal,
      { vaultRef }
    );
    return NextResponse.json({ success: true, data: { value } });
  } catch (error) {
    // The action throws "Forbidden: ..." for an inaccessible / unknown ref;
    // surface that as 403 and never leak internal detail to the client.
    const message = error instanceof Error ? error.message : "";
    const forbidden = message.includes("Forbidden");
    if (!forbidden) {
      Sentry.captureException(error, {
        tags: { source: "vault-reveal-route" },
        extra: { vaultRef },
      });
    }
    return NextResponse.json(
      {
        error: forbidden ? "Access denied" : "Failed to read secret",
        code: forbidden ? "FORBIDDEN" : "READ_FAILED",
      },
      { status: forbidden ? 403 : 500 }
    );
  }
}
