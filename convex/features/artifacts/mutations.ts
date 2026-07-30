import { ConvexError, v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { rateLimiter } from "../../lib/rateLimits";
import { countActiveArtifacts } from "../featureRegistry/gates";

const safeName = (value: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 100) {
    throw new ConvexError("Artifact name must be between 1 and 100 characters");
  }
  return normalized;
};

/** Persist metadata after the WorkOS key has been created. */
export const insertUpload = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    artifactId: v.optional(v.id("artifacts")),
    actorId: v.id("users"),
    name: v.string(),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
    originalSize: v.number(),
    contentHash: v.string(),
    encryptionMode: v.union(v.literal("managed"), v.literal("e2e")),
    keyVaultRef: v.string(),
    objectKey: v.string(),
    capacityLimit: v.optional(v.number()),
  },
  returns: v.object({
    artifactId: v.id("artifacts"),
    version: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    version: number;
  }> => {
    const now = Date.now();
    const name = safeName(args.name);

    await rateLimiter.limit(ctx, "artifactUpload", {
      key: args.organizationId,
      throws: true,
    });

    if (args.capacityLimit !== undefined && args.artifactId === undefined) {
      const current = await countActiveArtifacts(
        ctx.db,
        args.organizationId,
        args.capacityLimit
      );
      if (current >= args.capacityLimit) {
        throw new ConvexError(
          `Secure artifact limit reached (${current}/${args.capacityLimit}). Upgrade your tier for more.`
        );
      }
    }

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_name", (q) =>
        q.eq("projectId", args.projectId).eq("name", name)
      )
      .first();
    if (existing?.isActive && existing._id !== args.artifactId) {
      throw new ConvexError(`An artifact named "${name}" already exists`);
    }

    if (args.artifactId !== undefined) {
      const artifact = await ctx.db.get(args.artifactId);
      if (
        !artifact ||
        !artifact.isActive ||
        artifact.status !== "ready" ||
        artifact.projectId !== args.projectId ||
        artifact.organizationId !== args.organizationId
      ) {
        throw new ConvexError("Artifact not found");
      }
      if (artifact.name !== name) {
        throw new ConvexError("Artifact name cannot change during replacement");
      }
      const recentVersions = await ctx.db
        .query("artifactVersions")
        .withIndex("by_artifact", (q) => q.eq("artifactId", artifact._id))
        .order("desc")
        .take(101);
      if (recentVersions.length > 100) {
        throw new ConvexError(
          "Artifact has too many versions; delete it before uploading another"
        );
      }
      if (recentVersions.some((version) => version.status === "uploading")) {
        throw new ConvexError("An artifact replacement is already uploading");
      }
      const version = artifact.currentVersion + 1;
      await ctx.db.insert("artifactVersions", {
        artifactId: artifact._id,
        version,
        fileName: args.fileName,
        objectKey: args.objectKey,
        contentHash: args.contentHash,
        size: args.size,
        originalSize: args.originalSize,
        contentType: args.contentType,
        keyVaultRef: args.keyVaultRef,
        status: "uploading",
        createdBy: args.actorId,
        createdAt: now,
      });
      return { artifactId: artifact._id, version };
    }

    const artifactId = await ctx.db.insert("artifacts", {
      organizationId: args.organizationId,
      projectId: args.projectId,
      name,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      originalSize: args.originalSize,
      contentHash: args.contentHash,
      encryptionMode: args.encryptionMode,
      status: "uploading",
      currentVersion: 1,
      isActive: true,
      createdBy: args.actorId,
      lastModifiedBy: args.actorId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("artifactVersions", {
      artifactId,
      version: 1,
      fileName: args.fileName,
      objectKey: args.objectKey,
      contentHash: args.contentHash,
      size: args.size,
      originalSize: args.originalSize,
      contentType: args.contentType,
      keyVaultRef: args.keyVaultRef,
      status: "uploading",
      createdBy: args.actorId,
      createdAt: now,
    });

    return { artifactId, version: 1 };
  },
});

/** Mark a B2 object as complete after the API route has verified its size. */
export const completeUpload = internalMutation({
  args: { artifactId: v.id("artifacts"), version: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive)
      throw new ConvexError("Artifact not found");
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      args.version > 1 ? "project:update_artifact" : "project:create_artifact"
    );

    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", args.artifactId).eq("version", args.version)
      )
      .first();
    if (!version) {
      throw new ConvexError("Artifact upload is no longer pending");
    }
    if (version.status === "ready" && artifact.status === "ready") return true;
    if (version.status !== "uploading") {
      throw new ConvexError("Artifact upload is no longer pending");
    }

    const now = Date.now();
    const durableObjectKey = version.objectKey.replace(
      /^artifact-uploads\//,
      "artifacts/"
    );
    if (durableObjectKey === version.objectKey) {
      throw new ConvexError("Artifact upload namespace is invalid");
    }
    await ctx.db.patch(version._id, {
      status: "ready",
      completedAt: now,
      objectKey: durableObjectKey,
    });
    await ctx.db.patch(artifact._id, {
      status: "ready",
      fileName: version.fileName ?? artifact.fileName,
      contentType: version.contentType,
      size: version.size,
      originalSize: version.originalSize,
      contentHash: version.contentHash,
      currentVersion: version.version,
      updatedAt: now,
      lastModifiedBy: actor._id,
    });
    await ctx.db.insert("auditLogs", {
      organizationId: artifact.organizationId,
      projectId: artifact.projectId,
      userId: actor._id,
      action: version.version === 1 ? "artifact.created" : "artifact.updated",
      details: JSON.stringify({
        artifactId: artifact._id,
        name: artifact.name,
        version: version.version,
        size: version.originalSize,
        encryptionMode: artifact.encryptionMode,
      }),
      resourceType: "artifact",
      involvesSensitiveData: true,
      createdAt: now,
    });
    return true;
  },
});

/** Soft-delete metadata after the B2 object has been deleted successfully. */
export const softDeleteInternal = internalMutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) return false;
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      "project:delete_artifact"
    );

    const now = Date.now();
    await ctx.db.patch(artifact._id, {
      status: "deleted",
      isActive: false,
      deletedAt: now,
      updatedAt: now,
      lastModifiedBy: actor._id,
    });
    await ctx.db.insert("auditLogs", {
      organizationId: artifact.organizationId,
      projectId: artifact.projectId,
      userId: actor._id,
      action: "artifact.deleted",
      details: JSON.stringify({
        artifactId: artifact._id,
        name: artifact.name,
      }),
      resourceType: "artifact",
      involvesSensitiveData: true,
      createdAt: now,
    });
    return true;
  },
});

/** Record a metadata-only access event; the key is never written to audit. */
export const recordAccess = internalMutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive)
      throw new ConvexError("Artifact not found");
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      "project:read_artifact"
    );

    await ctx.db.insert("auditLogs", {
      organizationId: artifact.organizationId,
      projectId: artifact.projectId,
      userId: actor._id,
      action: "artifact.accessed",
      details: JSON.stringify({
        artifactId: artifact._id,
        name: artifact.name,
        version: artifact.currentVersion,
      }),
      resourceType: "artifact",
      involvesSensitiveData: true,
      createdAt: Date.now(),
    });
    return true;
  },
});

/** Abort a failed upload so its metadata is not listed as a live artifact. */
export const abortUpload = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    version: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) return false;
    const versionNumber = args.version ?? artifact.currentVersion;
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      versionNumber > 1 ? "project:update_artifact" : "project:create_artifact"
    );
    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", versionNumber)
      )
      .first();
    const now = Date.now();
    if (version?.status === "uploading") {
      await ctx.db.patch(version._id, {
        status: "aborted",
        keyDeletedAt: now,
      });
    }
    if (artifact.status === "uploading" && versionNumber === 1) {
      await ctx.db.patch(artifact._id, {
        status: "deleted",
        isActive: false,
        deletedAt: now,
        updatedAt: now,
        lastModifiedBy: actor._id,
      });
    }
    return true;
  },
});

/** Atomically retire a stale session before its external key is revoked. */
export const claimStaleUpload = internalMutation({
  args: {
    artifactId: v.id("artifacts"),
    version: v.number(),
    cutoff: v.number(),
  },
  returns: v.union(v.null(), v.object({ keyVaultRef: v.string() })),
  handler: async (ctx, args): Promise<{ keyVaultRef: string } | null> => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return null;
    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", args.version)
      )
      .first();
    if (!version || version.keyDeletedAt !== undefined) return null;
    if (version.status === "aborted") {
      return { keyVaultRef: version.keyVaultRef };
    }
    if (
      version.status !== "uploading" ||
      version.createdAt > args.cutoff ||
      !artifact.isActive
    ) {
      return null;
    }

    const now = Date.now();
    await ctx.db.patch(version._id, { status: "aborted" });
    if (artifact.status === "uploading" && args.version === 1) {
      await ctx.db.patch(artifact._id, {
        status: "deleted",
        isActive: false,
        deletedAt: now,
        updatedAt: now,
        lastModifiedBy: artifact.createdBy,
      });
    }
    return { keyVaultRef: version.keyVaultRef };
  },
});

/** Mark a claimed stale session's Vault key as successfully removed. */
export const recordArtifactKeyDeleted = internalMutation({
  args: { artifactId: v.id("artifacts"), version: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact) return false;
    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", args.version)
      )
      .first();
    if (!version || version.status !== "aborted") return false;
    await ctx.db.patch(version._id, { keyDeletedAt: Date.now() });
    return true;
  },
});
