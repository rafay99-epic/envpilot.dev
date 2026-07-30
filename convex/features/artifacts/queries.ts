import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
import {
  checkNumericLimit,
  countActiveArtifacts,
} from "../featureRegistry/gates";

const PLATFORM_ARTIFACT_LIMIT = 100;

const artifactMode = v.union(v.literal("managed"), v.literal("e2e"));

const artifactListItem = v.object({
  _id: v.id("artifacts"),
  name: v.string(),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
  originalSize: v.number(),
  contentHash: v.string(),
  encryptionMode: artifactMode,
  currentVersion: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

type ArtifactListItem = {
  _id: Id<"artifacts">;
  name: string;
  fileName: string;
  contentType: string;
  size: number;
  originalSize: number;
  contentHash: string;
  encryptionMode: "managed" | "e2e";
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
};

/** List active, ready artifact metadata for an authorized project member. */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(artifactListItem),
  handler: async (ctx, args): Promise<ArtifactListItem[]> => {
    const actor = await requireAuthedUser(ctx);
    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:read_artifact"
    );

    const rows = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "ready")
      )
      .order("desc")
      .take(100);

    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      fileName: row.fileName,
      contentType: row.contentType,
      size: row.size,
      originalSize: row.originalSize,
      contentHash: row.contentHash,
      encryptionMode: row.encryptionMode,
      currentVersion: row.currentVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});

/** Internal authorization gate used before creating a B2 upload session. */
export const authorizeUpload = internalQuery({
  args: {
    projectId: v.id("projects"),
    isReplacement: v.boolean(),
  },
  returns: v.object({
    actorId: v.id("users"),
    organizationId: v.id("organizations"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    actorId: Id<"users">;
    organizationId: Id<"organizations">;
  }> => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt)
      throw new ConvexError("Project not found");

    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      args.isReplacement
        ? "project:update_artifact"
        : "project:create_artifact",
      project
    );

    const enabled = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secure_artifacts"
    );
    if (!enabled.allowed) {
      throw new ConvexError(
        "Secure artifacts are not enabled for this organization"
      );
    }

    return { actorId: actor._id, organizationId: project.organizationId };
  },
});

/** Internal count/limit check used by the upload action before inserting. */
export const authorizeArtifactCapacity = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.object({
    allowed: v.boolean(),
    reason: v.optional(v.string()),
    limit: v.optional(v.number()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limit?: number;
  }> => {
    const enabled = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "secure_artifacts"
    );
    if (!enabled.allowed) return { allowed: false, reason: enabled.reason };

    const resolved = await checkNumericLimit(
      ctx.db,
      args.organizationId,
      "secure_artifacts_limit",
      0
    );
    // Bound storage cost even if an older deployment still has the historical
    // "unlimited" tier override. A lower configured tier/admin limit still
    // takes precedence.
    const effectiveLimit =
      resolved.limit === null
        ? PLATFORM_ARTIFACT_LIMIT
        : Math.min(resolved.limit, PLATFORM_ARTIFACT_LIMIT);

    const current = await countActiveArtifacts(
      ctx.db,
      args.organizationId,
      effectiveLimit
    );
    if (current >= effectiveLimit) {
      return {
        allowed: false,
        reason: `Secure artifact limit reached (${current}/${effectiveLimit}). Upgrade your tier for more.`,
      };
    }
    return { allowed: true, limit: effectiveLimit };
  },
});

/** Internal metadata lookup for the route that verifies the B2 upload. */
export const getUploadDetails = internalQuery({
  args: {
    artifactId: v.id("artifacts"),
    version: v.optional(v.number()),
  },
  returns: v.object({
    actorId: v.id("users"),
    artifactId: v.id("artifacts"),
    projectId: v.id("projects"),
    objectKey: v.string(),
    size: v.number(),
    version: v.number(),
    status: v.union(
      v.literal("uploading"),
      v.literal("ready"),
      v.literal("aborted")
    ),
    keyVaultRef: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    actorId: Id<"users">;
    artifactId: Id<"artifacts">;
    projectId: Id<"projects">;
    objectKey: string;
    size: number;
    version: number;
    status: "uploading" | "ready" | "aborted";
    keyVaultRef: string;
  }> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive)
      throw new ConvexError("Artifact not found");
    const requestedVersion = args.version;
    const version =
      requestedVersion !== undefined
        ? await ctx.db
            .query("artifactVersions")
            .withIndex("by_artifact_and_version", (q) =>
              q.eq("artifactId", artifact._id).eq("version", requestedVersion)
            )
            .first()
        : ((
            await ctx.db
              .query("artifactVersions")
              .withIndex("by_artifact", (q) => q.eq("artifactId", artifact._id))
              .order("desc")
              .take(20)
          ).find((candidate) => candidate.status === "uploading") ??
          (await ctx.db
            .query("artifactVersions")
            .withIndex("by_artifact_and_version", (q) =>
              q
                .eq("artifactId", artifact._id)
                .eq("version", artifact.currentVersion)
            )
            .first()));
    if (!version) throw new ConvexError("Artifact upload version not found");
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      version.version > 1
        ? "project:update_artifact"
        : "project:create_artifact"
    );

    return {
      actorId: actor._id,
      artifactId: artifact._id,
      projectId: artifact.projectId,
      objectKey: version.objectKey,
      size: version.size,
      version: version.version,
      status: version.status,
      keyVaultRef: version.keyVaultRef,
    };
  },
});

/** Internal authorized record used by the download action. */
export const getDownloadRecord = internalQuery({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    actorId: v.id("users"),
    artifactId: v.id("artifacts"),
    projectId: v.id("projects"),
    fileName: v.string(),
    contentType: v.string(),
    contentHash: v.string(),
    size: v.number(),
    originalSize: v.number(),
    version: v.number(),
    objectKey: v.string(),
    keyVaultRef: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
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
  }> => {
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

    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", artifact.currentVersion)
      )
      .first();
    if (!version || version.status !== "ready") {
      throw new ConvexError("Artifact is not ready");
    }

    return {
      actorId: actor._id,
      artifactId: artifact._id,
      projectId: artifact.projectId,
      fileName: artifact.fileName,
      contentType: artifact.contentType,
      contentHash: version.contentHash,
      size: version.size,
      originalSize: version.originalSize,
      version: version.version,
      objectKey: version.objectKey,
      keyVaultRef: version.keyVaultRef,
    };
  },
});

/** Internal authorized record used before deleting the B2 object. */
export const getDeleteRecord = internalQuery({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    objectKeys: v.array(v.string()),
    keyVaultRefs: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    artifactId: Id<"artifacts">;
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    objectKeys: string[];
    keyVaultRefs: string[];
  }> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive)
      throw new ConvexError("Artifact not found");
    await assertProjectAction(
      ctx,
      actor._id,
      artifact.projectId,
      "project:delete_artifact"
    );

    const versions = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact", (q) => q.eq("artifactId", artifact._id))
      .take(101);
    if (versions.length === 0)
      throw new ConvexError("Artifact version not found");
    if (versions.length > 100) {
      throw new ConvexError(
        "Artifact has too many versions to delete safely; contact support"
      );
    }

    return {
      artifactId: artifact._id,
      projectId: artifact.projectId,
      organizationId: artifact.organizationId,
      objectKeys: versions.map((version) => version.objectKey),
      keyVaultRefs: versions
        .filter((version) => version.keyDeletedAt === undefined)
        .map((version) => version.keyVaultRef),
    };
  },
});

/** Bounded oldest-first scan for upload sessions whose signed URL expired. */
export const listStaleUploads = internalQuery({
  args: { cutoff: v.number() },
  returns: v.array(
    v.object({
      artifactId: v.id("artifacts"),
      version: v.number(),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      artifactId: Id<"artifacts">;
      version: number;
    }>
  > => {
    const uploading = await ctx.db
      .query("artifactVersions")
      .withIndex("by_status", (q) => q.eq("status", "uploading"))
      .order("asc")
      .take(50);
    const retryable = await ctx.db
      .query("artifactVersions")
      .withIndex("by_status_and_key_deleted", (q) =>
        q.eq("status", "aborted").eq("keyDeletedAt", undefined)
      )
      .order("asc")
      .take(50);
    const uploads = new Map<
      string,
      { artifactId: Id<"artifacts">; version: number }
    >();
    for (const version of uploading) {
      if (version.createdAt <= args.cutoff) {
        uploads.set(`${version.artifactId}:${version.version}`, {
          artifactId: version.artifactId,
          version: version.version,
        });
      }
    }
    for (const version of retryable) {
      uploads.set(`${version.artifactId}:${version.version}`, {
        artifactId: version.artifactId,
        version: version.version,
      });
    }
    return [...uploads.values()].slice(0, 50);
  },
});
