import { ConvexError, v } from "convex/values";
import { internalMutation, mutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";

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
  },
  returns: v.object({
    artifactId: v.id("artifacts"),
    version: v.number(),
  }),
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    version: number;
  }> => {
    const now = Date.now();
    const name = safeName(args.name);

    const existing = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_name", (q) =>
        q.eq("projectId", args.projectId).eq("name", name)
      )
      .first();
    if (existing?.isActive) {
      throw new ConvexError(`An artifact named "${name}" already exists`);
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
export const completeUpload = mutation({
  args: { artifactId: v.id("artifacts"), version: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) throw new ConvexError("Artifact not found");
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:create_variable");

    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", args.artifactId).eq("version", args.version)
      )
      .first();
    if (!version || version.status !== "uploading") {
      throw new ConvexError("Artifact upload is no longer pending");
    }

    const now = Date.now();
    await ctx.db.patch(version._id, { status: "ready", completedAt: now });
    await ctx.db.patch(artifact._id, {
      status: "ready",
      updatedAt: now,
      lastModifiedBy: actor._id,
    });
    await ctx.db.insert("auditLogs", {
      organizationId: artifact.organizationId,
      projectId: artifact.projectId,
      userId: actor._id,
      action: "artifact.created",
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
export const softDelete = mutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) return false;
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:delete_variable");

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
      details: JSON.stringify({ artifactId: artifact._id, name: artifact.name }),
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
    if (!artifact || !artifact.isActive) throw new ConvexError("Artifact not found");
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:read");

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
  args: { artifactId: v.id("artifacts") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) return false;
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:create_variable");
    await ctx.db.patch(artifact._id, {
      status: "deleted",
      isActive: false,
      deletedAt: Date.now(),
    });
    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", artifact.currentVersion)
      )
      .first();
    if (version?.status === "uploading") {
      await ctx.db.patch(version._id, { status: "aborted" });
    }
    return true;
  },
});
