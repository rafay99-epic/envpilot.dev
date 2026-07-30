import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { purgeB2Object } from "@/lib/b2";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { getArtifactClient } from "@/lib/artifact-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/** Purge a failed direct upload, revoke its key, and retire its metadata. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const { id } = await params;
    const versionParam = new URL(request.url).searchParams.get("version");
    const version = versionParam ? Number(versionParam) : undefined;
    if (versionParam && (!Number.isInteger(version) || (version ?? 0) < 1)) {
      return NextResponse.json(
        { error: "Invalid artifact version" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const prepared = await authed.action(
      api.features.artifacts.actions.prepareUploadCompletion,
      { artifactId: id as Id<"artifacts">, version }
    );
    if (prepared.status !== "uploading") {
      return NextResponse.json(
        { cancelled: false },
        { headers: NO_STORE_HEADERS }
      );
    }

    let objectCleanupPending = false;
    try {
      await purgeB2Object(prepared.objectKey);
    } catch (error) {
      // Revoking the data key is the security boundary. If B2 is unavailable,
      // retire the metadata anyway and let the temporary-prefix lifecycle rule
      // delete any orphaned ciphertext.
      objectCleanupPending = true;
      reportApiError(error, "POST /api/artifacts/[id]/cancel", {
        artifactId: prepared.artifactId,
        phase: "temporary_object_cleanup",
      });
    }
    const cancelled = await authed.action(
      api.features.artifacts.actions.cancelUpload,
      { artifactId: prepared.artifactId, version: prepared.version }
    );
    return NextResponse.json(
      { cancelled, objectCleanupPending },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    return handleApiError(error, "Failed to cancel secure artifact upload");
  }
}
