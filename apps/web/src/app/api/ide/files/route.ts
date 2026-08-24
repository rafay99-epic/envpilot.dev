import { NextResponse } from "next/server";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

const VALID_ENVIRONMENTS = ["development", "staging", "production"];

/**
 * GET /api/ide/files?projectId=&environment= - Secret-file metadata for a
 * project (no contents). Visibility scoping is enforced by the query.
 */
export async function GET(request: Request) {
  try {
    const session = await ideAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }
    const environment = searchParams.get("environment");
    if (environment && !VALID_ENVIRONMENTS.includes(environment)) {
      return NextResponse.json(
        { error: "Invalid environment" },
        { status: 400 }
      );
    }

    const files = await createAuthedConvexClient(session.token).query(
      api.features.files.queries.list,
      {
        projectId: projectId as Id<"projects">,
        environment: environment ?? undefined,
      }
    );
    return NextResponse.json({ files });
  } catch (error) {
    reportApiError(error, "GET /api/ide/files");
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to fetch files");
  }
}
