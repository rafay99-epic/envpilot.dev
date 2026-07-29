import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { createB2DownloadUrl, deleteB2Object } from "@/lib/b2";
import { handleApiError } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Issue a short-lived B2 GET URL and the authorized local-decryption key. */
export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken);
    const prepared = await authed.action(api.features.artifacts.actions.prepareDownload, {
      artifactId: id as Id<"artifacts">,
    });
    const downloadUrl = await createB2DownloadUrl(prepared.objectKey);
    return NextResponse.json({
      artifactId: prepared.artifactId,
      fileName: prepared.fileName,
      contentType: prepared.contentType,
      contentHash: prepared.contentHash,
      size: prepared.size,
      originalSize: prepared.originalSize,
      version: prepared.version,
      downloadUrl,
      encryptionKey: prepared.encryptionKey,
    });
  } catch (error) {
    return handleApiError(error, "Failed to prepare secure artifact download");
  }
}

/** Delete the B2 object first, then soft-delete its Convex metadata. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken);
    const prepared = await authed.action(api.features.artifacts.actions.prepareDelete, {
      artifactId: id as Id<"artifacts">,
    });
    await deleteB2Object(prepared.objectKey);
    await authed.mutation(api.features.artifacts.mutations.softDelete, {
      artifactId: prepared.artifactId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to delete secure artifact");
  }
}
