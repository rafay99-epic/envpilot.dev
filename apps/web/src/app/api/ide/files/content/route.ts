import { NextResponse } from "next/server";
import { createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { ideAuth, isConvexAuthError } from "@/lib/ide-auth";

/**
 * GET /api/ide/files/content?fileId= - Base64 content of one secret file.
 * Goes through the getFileContent action: per-user rate limit + download
 * audit log are enforced there.
 */
export async function GET(request: Request) {
  try {
    const session = await ideAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      );
    }

    const file = await createAuthedConvexClient(session.token).action(
      api.features.files.values.getFileContent,
      {
        fileId: fileId as Id<"projectFiles">,
        source: "jetbrains",
      }
    );
    return NextResponse.json(file);
  } catch (error) {
    reportApiError(error, "GET /api/ide/files/content");
    if (isConvexAuthError(error)) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    return handleApiError(error, "Failed to fetch file content");
  }
}
