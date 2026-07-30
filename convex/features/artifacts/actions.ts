import { ConvexError, v } from "convex/values";
import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../lib/rateLimits";

const BASE64_KEY = /^[A-Za-z0-9+/]+={0,2}$/;
const HASH = /^[a-f0-9]{64}$/i;
const UPLOAD_ID = /^[0-9a-f-]{20,80}$/i;
const MAX_PLAINTEXT_BYTES = 50 * 1024 * 1024;
const AES_GCM_OVERHEAD_BYTES = 28;
const MAX_ENCRYPTED_BYTES = MAX_PLAINTEXT_BYTES + AES_GCM_OVERHEAD_BYTES;

type UploadAuthorization = {
  actorId: Id<"users">;
  organizationId: Id<"organizations">;
};
type VaultSecret = { id: string; versionId?: string; keyId?: string };
type CreatedUpload = { artifactId: Id<"artifacts">; version: number };
type DownloadRecord = {
  actorId: Id<"users">;
  artifactId: Id<"artifacts">;
  projectId: Id<"projects">;
  fileName: string;
  contentType: string;
  contentHash: string;
  size: number;
  originalSize: number;
  version: number;
  objectKey: string;
  keyVaultRef: string;
};

function safeFileName(fileName: string): string {
  const base = fileName.trim().split(/[\\/]/).pop() ?? "artifact.bin";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160);
  return cleaned || "artifact.bin";
}

async function artifactCompletionProof(input: {
  artifactId: Id<"artifacts">;
  version: number;
  objectKey: string;
  size: number;
}): Promise<string> {
  const secret = process.env.WORKOS_API_KEY;
  if (!secret) {
    throw new ConvexError("Artifact completion service is not configured");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const message = [
    "envpilot:artifact-completion:v1",
    input.artifactId,
    String(input.version),
    input.objectKey,
    String(input.size),
  ].join("\0");
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))
  );
  return Array.from(signature, (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** Authorize an upload, store the wrapped client data key, and create metadata. */
export const startUpload = action({
  args: {
    uploadId: v.string(),
    projectId: v.id("projects"),
    artifactId: v.optional(v.id("artifacts")),
    name: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    originalSize: v.number(),
    contentHash: v.string(),
    encryptionKey: v.string(),
    // E2E key envelopes are reserved for the device-enrollment phase. This
    // first release is explicit about using recoverable managed encryption.
    encryptionMode: v.literal("managed"),
  },
  returns: v.object({
    artifactId: v.id("artifacts"),
    version: v.number(),
    objectKey: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    version: number;
    objectKey: string;
  }> => {
    const artifactName = args.name.trim();
    if (!artifactName || artifactName.length > 100) {
      throw new ConvexError(
        "Artifact name must be between 1 and 100 characters"
      );
    }
    if (!args.fileName.trim() || args.fileName.length > 255) {
      throw new ConvexError("Artifact file name is invalid");
    }
    if (args.contentType.length > 200) {
      throw new ConvexError("Artifact content type is invalid");
    }
    if (!UPLOAD_ID.test(args.uploadId)) {
      throw new ConvexError("Invalid upload session");
    }
    if (!HASH.test(args.contentHash)) {
      throw new ConvexError("Invalid encrypted artifact hash");
    }
    if (
      !BASE64_KEY.test(args.encryptionKey) ||
      args.encryptionKey.length !== 44
    ) {
      throw new ConvexError("Invalid artifact encryption key");
    }
    if (args.size < AES_GCM_OVERHEAD_BYTES || args.size > MAX_ENCRYPTED_BYTES) {
      throw new ConvexError("Encrypted artifact size is invalid");
    }
    if (args.originalSize < 0 || args.originalSize > MAX_PLAINTEXT_BYTES) {
      throw new ConvexError("Artifact is too large");
    }
    if (args.size !== args.originalSize + AES_GCM_OVERHEAD_BYTES) {
      throw new ConvexError("Encrypted artifact manifest is inconsistent");
    }

    const access: UploadAuthorization = await ctx.runQuery(
      internal.features.artifacts.queries.authorizeUpload,
      {
        projectId: args.projectId,
        isReplacement: args.artifactId !== undefined,
      }
    );
    const capacity: {
      allowed: boolean;
      reason?: string;
      limit?: number;
    } = args.artifactId
      ? { allowed: true as const }
      : await ctx.runQuery(
          internal.features.artifacts.queries.authorizeArtifactCapacity,
          { organizationId: access.organizationId }
        );
    if (!capacity.allowed)
      throw new ConvexError(
        capacity.reason ?? "Secure artifacts are unavailable"
      );

    const key: VaultSecret = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: `artifact:${artifactName}`,
        value: args.encryptionKey,
        organizationId: access.organizationId,
        projectId: args.projectId,
      }
    );
    const objectKey = `artifact-uploads/${args.projectId}/${args.uploadId}/${safeFileName(args.fileName)}`;

    try {
      const created: CreatedUpload = await ctx.runMutation(
        internal.features.artifacts.mutations.insertUpload,
        {
          organizationId: access.organizationId,
          projectId: args.projectId,
          artifactId: args.artifactId,
          actorId: access.actorId,
          name: artifactName,
          fileName: safeFileName(args.fileName),
          contentType: args.contentType || "application/octet-stream",
          size: args.size,
          originalSize: args.originalSize,
          contentHash: args.contentHash.toLowerCase(),
          encryptionMode: args.encryptionMode,
          keyVaultRef: key.id,
          objectKey,
          capacityLimit: capacity.limit,
        }
      );
      return { ...created, objectKey };
    } catch (error) {
      const cleaned = await ctx.runAction(
        internal.features.vault.vault.deleteSecret,
        {
          vaultRef: key.id,
        }
      );
      if (!cleaned) {
        throw new ConvexError(
          "Upload setup failed and its encryption key could not be cleaned up"
        );
      }
      throw error;
    }
  },
});

/** Return a key only after resource authorization, for local decryption. */
export const prepareDownload = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    fileName: v.string(),
    contentType: v.string(),
    contentHash: v.string(),
    size: v.number(),
    originalSize: v.number(),
    version: v.number(),
    objectKey: v.string(),
    encryptionKey: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    fileName: string;
    contentType: string;
    contentHash: string;
    size: number;
    originalSize: number;
    version: number;
    objectKey: string;
    encryptionKey: string;
  }> => {
    const record: DownloadRecord = await ctx.runQuery(
      internal.features.artifacts.queries.getDownloadRecord,
      args
    );
    await rateLimiter.limit(ctx, "artifactDownload", {
      key: record.actorId,
      throws: true,
    });
    const encryptionKey = await ctx.runAction(
      internal.features.vault.vault.readSecret,
      { vaultRef: record.keyVaultRef }
    );
    await ctx.runMutation(internal.features.artifacts.mutations.recordAccess, {
      artifactId: record.artifactId,
    });
    return {
      artifactId: record.artifactId,
      fileName: record.fileName,
      contentType: record.contentType,
      contentHash: record.contentHash,
      size: record.size,
      originalSize: record.originalSize,
      version: record.version,
      objectKey: record.objectKey,
      encryptionKey,
    };
  },
});

/** Return the object key and expected size for server-side B2 HEAD validation. */
export const prepareUploadCompletion = action({
  args: {
    artifactId: v.id("artifacts"),
    version: v.optional(v.number()),
  },
  returns: v.object({
    artifactId: v.id("artifacts"),
    objectKey: v.string(),
    size: v.number(),
    version: v.number(),
    status: v.union(
      v.literal("uploading"),
      v.literal("ready"),
      v.literal("aborted")
    ),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    objectKey: string;
    size: number;
    version: number;
    status: "uploading" | "ready" | "aborted";
  }> => {
    const record: {
      artifactId: Id<"artifacts">;
      objectKey: string;
      size: number;
      version: number;
      status: "uploading" | "ready" | "aborted";
    } = await ctx.runQuery(
      internal.features.artifacts.queries.getUploadDetails,
      args
    );
    return {
      artifactId: record.artifactId,
      objectKey: record.objectKey,
      size: record.size,
      version: record.version,
      status: record.status,
    };
  },
});

/**
 * Commit metadata only when the server-side B2 HEAD/copy path supplies a
 * valid HMAC proof. A client calling Convex directly cannot mark a missing or
 * truncated object ready.
 */
export const completeVerifiedUpload = action({
  args: {
    artifactId: v.id("artifacts"),
    version: v.number(),
    completionProof: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    if (!/^[a-f0-9]{64}$/i.test(args.completionProof)) {
      throw new ConvexError("Artifact completion proof is invalid");
    }
    const record: {
      objectKey: string;
      size: number;
      version: number;
      status: "uploading" | "ready" | "aborted";
    } = await ctx.runQuery(
      internal.features.artifacts.queries.getUploadDetails,
      { artifactId: args.artifactId, version: args.version }
    );
    if (record.version !== args.version) {
      throw new ConvexError("Artifact upload version is invalid");
    }
    if (record.status === "ready") return true;
    if (record.status !== "uploading") {
      throw new ConvexError("Artifact upload is no longer pending");
    }
    const expected = await artifactCompletionProof({
      artifactId: args.artifactId,
      version: record.version,
      objectKey: record.objectKey,
      size: record.size,
    });
    if (!constantTimeEqual(expected, args.completionProof.toLowerCase())) {
      throw new ConvexError("Artifact completion proof is invalid");
    }
    return ctx.runMutation(
      internal.features.artifacts.mutations.completeUpload,
      { artifactId: args.artifactId, version: record.version }
    );
  },
});

/** Return the object key after delete authorization. */
export const prepareDelete = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    objectKeys: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    objectKeys: string[];
  }> => {
    const record: {
      artifactId: Id<"artifacts">;
      objectKeys: string[];
    } = await ctx.runQuery(
      internal.features.artifacts.queries.getDeleteRecord,
      args
    );
    return { artifactId: record.artifactId, objectKeys: record.objectKeys };
  },
});

/** Delete every data key, then soft-delete metadata. Safe to retry. */
export const finalizeDelete = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const record: { keyVaultRefs: string[] } = await ctx.runQuery(
      internal.features.artifacts.queries.getDeleteRecord,
      args
    );
    for (const vaultRef of record.keyVaultRefs) {
      const deleted = await ctx.runAction(
        internal.features.vault.vault.deleteSecret,
        { vaultRef }
      );
      if (!deleted) {
        throw new ConvexError(
          "Artifact key deletion failed; the artifact remains active so deletion can be retried"
        );
      }
    }
    return ctx.runMutation(
      internal.features.artifacts.mutations.softDeleteInternal,
      args
    );
  },
});

/** Clean up a failed presign/upload attempt, including its Vault key. */
export const cancelUpload = action({
  args: {
    artifactId: v.id("artifacts"),
    version: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const record: {
      keyVaultRef: string;
      version: number;
      status: "uploading" | "ready" | "aborted";
    } = await ctx.runQuery(
      internal.features.artifacts.queries.getUploadDetails,
      args
    );
    // A retry can arrive after completion succeeded. Never revoke the key for
    // a ready artifact; only an upload that is still pending is cancellable.
    if (record.status !== "uploading") return false;
    if (record.keyVaultRef) {
      const deleted = await ctx.runAction(
        internal.features.vault.vault.deleteSecret,
        {
          vaultRef: record.keyVaultRef,
        }
      );
      if (!deleted) {
        throw new ConvexError(
          "Artifact key cleanup failed; cancellation can be retried"
        );
      }
    }
    return ctx.runMutation(internal.features.artifacts.mutations.abortUpload, {
      artifactId: args.artifactId,
      version: record.version,
    });
  },
});

/**
 * Revoke keys for upload sessions that outlived their presigned URL. B2
 * lifecycle rules separately expire the temporary object prefix.
 */
export const cleanupStaleUploads = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const cutoff = Date.now() - 60 * 60 * 1_000;
    const stale: Array<{
      artifactId: Id<"artifacts">;
      version: number;
    }> = await ctx.runQuery(
      internal.features.artifacts.queries.listStaleUploads,
      { cutoff }
    );
    let cleaned = 0;
    for (const upload of stale) {
      const claimed: { keyVaultRef: string } | null = await ctx.runMutation(
        internal.features.artifacts.mutations.claimStaleUpload,
        {
          artifactId: upload.artifactId,
          version: upload.version,
          cutoff,
        }
      );
      if (!claimed) continue;
      const keyDeleted = await ctx.runAction(
        internal.features.vault.vault.deleteSecret,
        { vaultRef: claimed.keyVaultRef }
      );
      if (!keyDeleted) continue;
      await ctx.runMutation(
        internal.features.artifacts.mutations.recordArtifactKeyDeleted,
        { artifactId: upload.artifactId, version: upload.version }
      );
      cleaned += 1;
    }
    return cleaned;
  },
});
