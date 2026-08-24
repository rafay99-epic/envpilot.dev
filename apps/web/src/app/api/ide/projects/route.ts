import { NextResponse } from "next/server";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

/**
 * GET /api/ide/projects?organizationId= - Projects in an organization,
 * filtered by the caller's membership/assignment server-side.
 */
export async function GET(request: Request) {
  try {
    const session = await ideAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const organizationId = new URL(request.url).searchParams.get(
      "organizationId"
    );
    if (!organizationId) {
      return NextResponse.json(
        { error: "organizationId is required" },
        { status: 400 }
      );
    }

    const projects = await createAuthedConvexClient(session.token).query(
      api.features.projects.queries.listWithStats,
      { organizationId: organizationId as Id<"organizations"> }
    );
    return NextResponse.json({ projects });
  } catch (error) {
    reportApiError(error, "GET /api/ide/projects");
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to fetch projects");
  }
}
