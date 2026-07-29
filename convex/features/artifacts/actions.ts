import { ConvexError, v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

const BASE64_KEY = /^[A-Za-z0-9+/]+={0,2}$/;
const HASH = /^[a-f0-9]{64}$/i;
const UPLOAD_ID = /^[0-9a-f-]{20,80}$/i;

type UploadAuthorization = {
  actorId: Id<"users">;
  organizationId: Id<"organizations">;
};
type VaultSecret = { id: string; versionId?: string; keyId?: string };
type CreatedUpload = { artifactId: Id<"artifacts">; version: number };
type DownloadRecord = {
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

/** Authorize an upload, store the wrapped client data key, and create metadata. */
export const startUpload = action({
  args: {
    uploadId: v.string(),
    projectId: v.id("projects"),
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
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    version: number;
    objectKey: string;
  }> => {
    if (!UPLOAD_ID.test(args.uploadId)) {
      throw new ConvexError("Invalid upload session");
    }
    if (!HASH.test(args.contentHash)) {
      throw new ConvexError("Invalid encrypted artifact hash");
    }
    if (!BASE64_KEY.test(args.encryptionKey) || args.encryptionKey.length !== 44) {
      throw new ConvexError("Invalid artifact encryption key");
    }
    if (args.size < 29 || args.size > 50 * 1024 * 1024) {
      throw new ConvexError("Artifact must be between 1 byte and 50 MiB");
    }
    if (args.originalSize < 0 || args.originalSize > 50 * 1024 * 1024) {
      throw new ConvexError("Artifact is too large");
    }

    const access: UploadAuthorization = await ctx.runQuery(
      internal.features.artifacts.queries.authorizeUpload,
      { projectId: args.projectId }
    );
    const capacity = await ctx.runQuery(
      internal.features.artifacts.queries.authorizeArtifactCapacity,
      { organizationId: access.organizationId }
    );
    if (!capacity.allowed) throw new ConvexError(capacity.reason ?? "Secure artifacts are unavailable");

    const key: VaultSecret = await ctx.runAction(internal.features.vault.vault.createSecret, {
      name: `artifact:${args.name}`,
      value: args.encryptionKey,
      organizationId: access.organizationId,
      projectId: args.projectId,
    });
    const objectKey = `artifacts/${args.projectId}/${args.uploadId}/${safeFileName(args.fileName)}`;

    try {
      const created: CreatedUpload = await ctx.runMutation(
        internal.features.artifacts.mutations.insertUpload,
        {
          organizationId: access.organizationId,
          projectId: args.projectId,
          actorId: access.actorId,
          name: args.name,
          fileName: safeFileName(args.fileName),
          contentType: args.contentType || "application/octet-stream",
          size: args.size,
          originalSize: args.originalSize,
          contentHash: args.contentHash.toLowerCase(),
          encryptionMode: args.encryptionMode,
          keyVaultRef: key.id,
          objectKey,
        }
      );
      return { ...created, objectKey };
    } catch (error) {
      await ctx.runAction(internal.features.vault.vault.deleteSecret, {
        vaultRef: key.id,
      });
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
  handler: async (ctx, args): Promise<{
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
    const encryptionKey = await ctx.runAction(
      internal.features.vault.vault.readSecret,
      { vaultRef: record.keyVaultRef }
    );
    await ctx.runMutation(internal.features.artifacts.mutations.recordAccess, {
      artifactId: record.artifactId,
    });
    return { ...record, encryptionKey };
  },
});

/** Return the object key and expected size for server-side B2 HEAD validation. */
export const prepareUploadCompletion = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    objectKey: v.string(),
    size: v.number(),
    version: v.number(),
    status: v.union(v.literal("uploading"), v.literal("ready"), v.literal("aborted")),
  }),
  handler: async (ctx, args): Promise<{
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
      status: "uploading" | "ready" | "aborted";
    } = await ctx.runQuery(
      internal.features.artifacts.queries.getUploadDetails,
      args
    );
    return {
      artifactId: record.artifactId,
      objectKey: record.objectKey,
      size: record.size,
      version: 1,
      status: record.status,
    };
  },
});

/** Return the object key after delete authorization. */
export const prepareDelete = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    objectKey: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    objectKey: string;
  }> => {
    const record: { artifactId: Id<"artifacts">; objectKey: string } = await ctx.runQuery(
      internal.features.artifacts.queries.getDeleteRecord,
      args
    );
    return { artifactId: record.artifactId, objectKey: record.objectKey };
  },
});

/** Clean up a failed presign/upload attempt, including its Vault key. */
export const cancelUpload = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const record: { keyVaultRef: string; status: "uploading" | "ready" | "aborted" } = await ctx.runQuery(
      internal.features.artifacts.queries.getUploadDetails,
      args
    );
    // A retry can arrive after completion succeeded. Never revoke the key for
    // a ready artifact; only an upload that is still pending is cancellable.
    if (record.status !== "uploading") return false;
    if (record.keyVaultRef) {
      await ctx.runAction(internal.features.vault.vault.deleteSecret, {
        vaultRef: record.keyVaultRef,
      });
    }
    return ctx.runMutation(internal.features.artifacts.mutations.abortUpload, args);
  },
});
