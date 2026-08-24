import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

/**
 * GET /api/ide/orgs - Organizations the signed-in user belongs to.
 * Used by the JetBrains plugin (and future IDE clients).
 */
export async function GET() {
  try {
    const { user, accessToken } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    await getOrCreateConvexUser(convex, user);
    const organizations = await createAuthedConvexClient(accessToken!).query(
      api.features.organizations.queries.listForUser,
      {}
    );
    return NextResponse.json({ organizations });
  } catch (error) {
    reportApiError(error, "GET /api/ide/orgs");
    return handleApiError(error, "Failed to fetch organizations");
  }
}
