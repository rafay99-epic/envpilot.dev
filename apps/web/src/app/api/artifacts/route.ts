import { NextResponse } from "next/server";
import { z } from "zod";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  B2ConfigurationError,
  createB2UploadUrl,
  verifyB2Access,
} from "@/lib/b2";
import { getArtifactClient } from "@/lib/artifact-auth";
import { handleApiError, sanitizeConvexError } from "@/lib/api-errors";
import {
  AES_GCM_OVERHEAD_BYTES,
  MAX_ARTIFACT_ENCRYPTED_BYTES,
  MAX_ARTIFACT_PLAINTEXT_BYTES,
} from "@/lib/artifact-crypto";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
};

const uploadSchema = z
  .object({
    projectId: z.string().min(1),
    artifactId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(100),
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(200).default("application/octet-stream"),
    encryptedSize: z
      .number()
      .int()
      .min(AES_GCM_OVERHEAD_BYTES)
      .max(MAX_ARTIFACT_ENCRYPTED_BYTES),
    originalSize: z.number().int().min(0).max(MAX_ARTIFACT_PLAINTEXT_BYTES),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
    encryptionKey: z.string().min(40).max(100),
    encryptionMode: z.literal("managed").default("managed"),
  })
  .refine(
    (value) =>
      value.encryptedSize === value.originalSize + AES_GCM_OVERHEAD_BYTES,
    { message: "Encrypted artifact manifest is inconsistent" }
  );

/** List artifact metadata. Ciphertext and keys never pass through this route. */
export async function GET(request: Request) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }
    const artifacts = await authed.query(
      api.features.artifacts.queries.listForProject,
      { projectId: projectId as Id<"projects"> }
    );
    return NextResponse.json({ artifacts }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleApiError(error, "Failed to list secure artifacts");
  }
}

/** Create a client-encrypted upload session and return a direct B2 PUT URL. */
export async function POST(request: Request) {
  try {
    const authed = await getArtifactClient(request);
    if (!authed) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const parsed = uploadSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    await verifyB2Access();

    const started = await authed.action(
      api.features.artifacts.actions.startUpload,
      {
        uploadId: crypto.randomUUID(),
        projectId: parsed.data.projectId as Id<"projects">,
        artifactId: parsed.data.artifactId as Id<"artifacts"> | undefined,
        name: parsed.data.name,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
        size: parsed.data.encryptedSize,
        originalSize: parsed.data.originalSize,
        contentHash: parsed.data.contentHash,
        encryptionKey: parsed.data.encryptionKey,
        encryptionMode: parsed.data.encryptionMode,
      }
    );
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
      { status: 201, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    if (error instanceof B2ConfigurationError) {
      return NextResponse.json(
        { error: error.message, code: "ARTIFACT_STORAGE_UNAVAILABLE" },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
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
