import { NextResponse } from "next/server";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

/**
 * GET /api/ide/orgs - Organizations the signed-in user belongs to.
 * Used by the JetBrains plugin (and future IDE clients).
 */
export async function GET(request: Request) {
  try {
    const session = await ideAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const organizations = await createAuthedConvexClient(session.token).query(
      api.features.organizations.queries.listForUser,
      {}
    );
    return NextResponse.json({ organizations });
  } catch (error) {
    reportApiError(error, "GET /api/ide/orgs");
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to fetch organizations");
  }
}
