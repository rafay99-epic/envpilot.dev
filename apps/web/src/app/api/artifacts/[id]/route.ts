import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { createB2DownloadUrl, purgeB2Object } from "@/lib/b2";
import { handleApiError } from "@/lib/api-errors";
import { getArtifactClient } from "@/lib/artifact-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const SENSITIVE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

/** Issue a short-lived B2 GET URL and the authorized local-decryption key. */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    const prepared = await authed.action(
      api.features.artifacts.actions.prepareDownload,
      {
        artifactId: id as Id<"artifacts">,
      }
    );
    const downloadUrl = await createB2DownloadUrl(prepared.objectKey);
    return NextResponse.json(
      {
        artifactId: prepared.artifactId,
        fileName: prepared.fileName,
        contentType: prepared.contentType,
        contentHash: prepared.contentHash,
        size: prepared.size,
        originalSize: prepared.originalSize,
        version: prepared.version,
        downloadUrl,
        encryptionKey: prepared.encryptionKey,
      },
      { headers: SENSITIVE_HEADERS }
    );
  } catch (error) {
    return handleApiError(error, "Failed to prepare secure artifact download");
  }
}

/** Delete the B2 object first, then soft-delete its Convex metadata. */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    const prepared = await authed.action(
      api.features.artifacts.actions.prepareDelete,
      {
        artifactId: id as Id<"artifacts">,
      }
    );
    for (const objectKey of prepared.objectKeys) {
      await purgeB2Object(objectKey);
    }
    await authed.action(api.features.artifacts.actions.finalizeDelete, {
      artifactId: prepared.artifactId,
    });
    return NextResponse.json({ success: true }, { headers: SENSITIVE_HEADERS });
  } catch (error) {
    return handleApiError(error, "Failed to delete secure artifact");
  }
}
