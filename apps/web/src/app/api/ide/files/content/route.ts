import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";

/**
 * GET /api/ide/files/content?fileId= - Base64 content of one secret file.
 * Goes through the getFileContent action: per-user rate limit + download
 * audit log are enforced there.
 */
export async function GET(request: Request) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const fileId = new URL(request.url).searchParams.get("fileId");
    if (!fileId) {
      return NextResponse.json(
        { error: "fileId is required" },
        { status: 400 }
      );
    }

    await getOrCreateConvexUser(convex, user);
    const file = await createAuthedConvexClient(accessToken!).action(
      api.features.files.values.getFileContent,
      {
        fileId: fileId as Id<"projectFiles">,
        source: "jetbrains",
      }
    );
    return NextResponse.json(file);
  } catch (error) {
    reportApiError(error, "GET /api/ide/files/content");
    return handleApiError(error, "Failed to fetch file content");
  }
}
