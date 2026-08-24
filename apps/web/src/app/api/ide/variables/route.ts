import { NextResponse } from "next/server";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

const VALID_ENVIRONMENTS = ["development", "staging", "production"];

/**
 * GET /api/ide/variables?projectId=&environment=&metadataOnly=
 *
 * Wraps the pullValues action so IDE clients get the exact same authz chain,
 * environment scoping, audit logging and decrypt handling as the extension.
 * metadataOnly=true (default) skips the vault read — safe for listings.
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
    const metadataOnly = searchParams.get("metadataOnly") !== "false";

    const result = await createAuthedConvexClient(session.token).action(
      api.features.variables.values.pullValues,
      {
        projectId: projectId as Id<"projects">,
        environment: environment ?? undefined,
        metadataOnly,
      }
    );
    return NextResponse.json(result);
  } catch (error) {
    reportApiError(error, "GET /api/ide/variables");
    // ConvexError payloads carry user-facing messages (e.g. permission
    // denials); pass them through with a sane status.
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to fetch variables";
    if (/unauthenticated/i.test(message)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!/server error/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return handleApiError(error, "Failed to fetch variables");
  }
}
