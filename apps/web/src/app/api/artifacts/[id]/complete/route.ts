import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { headB2Object, promoteB2Upload, purgeB2Object } from "@/lib/b2";
import { handleApiError, reportApiError } from "@/lib/api-errors";
import { getArtifactClient } from "@/lib/artifact-auth";
import { createArtifactCompletionProof } from "@/lib/artifact-completion";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
};

/** Verify the direct B2 upload exists with the expected byte count. */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
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
    if (prepared.status === "ready") {
      return NextResponse.json(
        { success: true },
        { headers: NO_STORE_HEADERS }
      );
    }
    const object = await headB2Object(prepared.objectKey);
    if (object.contentLength !== prepared.size) {
      await purgeB2Object(prepared.objectKey);
      await authed.action(api.features.artifacts.actions.cancelUpload, {
        artifactId: prepared.artifactId,
      });
      return NextResponse.json(
        {
          error: "Uploaded artifact size did not match the encrypted manifest",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }
    const durableObjectKey = await promoteB2Upload(prepared.objectKey);
    const durableObject = await headB2Object(durableObjectKey);
    if (durableObject.contentLength !== prepared.size) {
      await purgeB2Object(durableObjectKey);
      throw new Error(
        "Promoted B2 artifact did not match the encrypted manifest"
      );
    }
    const completionProof = createArtifactCompletionProof({
      artifactId: prepared.artifactId,
      version: prepared.version,
      objectKey: prepared.objectKey,
      size: prepared.size,
    });
    await authed.action(api.features.artifacts.actions.completeVerifiedUpload, {
      artifactId: prepared.artifactId,
      version: prepared.version,
      completionProof,
    });
    try {
      await purgeB2Object(prepared.objectKey);
    } catch (error) {
      // The durable copy is already committed. B2 lifecycle rules will expire
      // this temporary prefix; report the cleanup miss without failing upload.
      reportApiError(error, "POST /api/artifacts/[id]/complete", {
        artifactId: prepared.artifactId,
        phase: "temporary_object_cleanup",
      });
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleApiError(error, "Failed to complete secure artifact upload");
  }
}
