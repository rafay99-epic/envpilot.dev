import { withAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convex, createAuthedConvexClient } from "@/lib/convex-client";
import { getOrCreateConvexUser } from "@/lib/convex-helpers";
import { createB2UploadUrl } from "@/lib/b2";
import { handleApiError, sanitizeConvexError } from "@/lib/api-errors";

const uploadSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(200).default("application/octet-stream"),
  encryptedSize: z.number().int().min(29).max(50 * 1024 * 1024),
  originalSize: z.number().int().min(0).max(50 * 1024 * 1024),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
  encryptionKey: z.string().min(40).max(100),
  encryptionMode: z.literal("managed").default("managed"),
});

/** List artifact metadata. Ciphertext and keys never pass through this route. */
export async function GET(request: Request) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }
    await getOrCreateConvexUser(convex, user);
    const artifacts = await createAuthedConvexClient(accessToken).query(
      api.features.artifacts.queries.listForProject,
      { projectId: projectId as Id<"projects"> }
    );
    return NextResponse.json({ artifacts });
  } catch (error) {
    return handleApiError(error, "Failed to list secure artifacts");
  }
}

/** Create a client-encrypted upload session and return a direct B2 PUT URL. */
export async function POST(request: Request) {
  try {
    const { user, accessToken } = await withAuth();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const parsed = uploadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await getOrCreateConvexUser(convex, user);
    const authed = createAuthedConvexClient(accessToken);
    const started = await authed.action(api.features.artifacts.actions.startUpload, {
      uploadId: crypto.randomUUID(),
      projectId: parsed.data.projectId as Id<"projects">,
      name: parsed.data.name,
      fileName: parsed.data.fileName,
      contentType: parsed.data.contentType,
      size: parsed.data.encryptedSize,
      originalSize: parsed.data.originalSize,
      contentHash: parsed.data.contentHash,
      encryptionKey: parsed.data.encryptionKey,
      encryptionMode: parsed.data.encryptionMode,
    });
    let uploadUrl: string;
    try {
      uploadUrl = await createB2UploadUrl({
        objectKey: started.objectKey,
        contentType: parsed.data.contentType,
      });
    } catch (error) {
      await authed.action(api.features.artifacts.actions.cancelUpload, {
        artifactId: started.artifactId,
      });
      throw error;
    }

    return NextResponse.json(
      {
        artifactId: started.artifactId,
        version: started.version,
        uploadUrl,
        objectKey: started.objectKey,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = sanitizeConvexError(error);
    if (message.includes("not enabled") || message.includes("limit reached")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return handleApiError(error, "Failed to create secure artifact upload");
  }
}
