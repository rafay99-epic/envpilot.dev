import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { deleteB2Object, headB2Object } from "@/lib/b2";
import { handleApiError } from "@/lib/api-errors";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Verify the direct B2 upload exists with the expected byte count. */
export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const { id } = await params;
    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken);
    const prepared = await authed.action(
      api.features.artifacts.actions.prepareUploadCompletion,
      { artifactId: id as Id<"artifacts"> }
    );
    const object = await headB2Object(prepared.objectKey);
    if (object.contentLength !== prepared.size) {
      await deleteB2Object(prepared.objectKey).catch(() => undefined);
      await authed.action(api.features.artifacts.actions.cancelUpload, {
        artifactId: prepared.artifactId,
      });
      return NextResponse.json(
        { error: "Uploaded artifact size did not match the encrypted manifest" },
        { status: 400 }
      );
    }
    await authed.mutation(api.features.artifacts.mutations.completeUpload, {
      artifactId: prepared.artifactId,
      version: prepared.version,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "Failed to complete secure artifact upload");
  }
}
