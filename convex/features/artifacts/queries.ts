import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { checkNumericLimit, countActiveArtifacts } from "../featureRegistry/gates";

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

/** List active, ready artifact metadata for an assigned project. */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.array(artifactListItem),
  handler: async (ctx, args): Promise<ArtifactListItem[]> => {
    const actor = await requireAuthedUser(ctx);
    await assertProjectAction(ctx, actor._id, args.projectId, "project:read");

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
  },
  returns: v.object({
    actorId: v.id("users"),
    organizationId: v.id("organizations"),
  }),
  handler: async (ctx, args): Promise<{
    actorId: Id<"users">;
    organizationId: Id<"organizations">;
  }> => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) throw new ConvexError("Project not found");

    await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:create_variable",
      project
    );

    const enabled = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secure_artifacts"
    );
    if (!enabled.allowed) {
      throw new ConvexError("Secure artifacts are not enabled for this organization");
    }

    return { actorId: actor._id, organizationId: project.organizationId };
  },
});

/** Internal count/limit check used by the upload action before inserting. */
export const authorizeArtifactCapacity = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.object({ allowed: v.boolean(), reason: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{
    allowed: boolean;
    reason?: string;
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
    if (resolved.limit === null) return { allowed: true };

    const current = await countActiveArtifacts(
      ctx.db,
      args.organizationId,
      resolved.limit
    );
    if (current >= resolved.limit) {
      return {
        allowed: false,
        reason: `Secure artifact limit reached (${current}/${resolved.limit}). Upgrade your tier for more.`,
      };
    }
    return { allowed: true };
  },
});

/** Internal metadata lookup for the route that verifies the B2 upload. */
export const getUploadDetails = internalQuery({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
    artifactId: v.id("artifacts"),
    projectId: v.id("projects"),
    objectKey: v.string(),
    size: v.number(),
    status: v.union(v.literal("uploading"), v.literal("ready"), v.literal("aborted")),
    keyVaultRef: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    projectId: Id<"projects">;
    objectKey: string;
    size: number;
    status: "uploading" | "ready" | "aborted";
    keyVaultRef: string;
  }> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) throw new ConvexError("Artifact not found");
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:read");

    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", artifact.currentVersion)
      )
      .first();
    if (!version) throw new ConvexError("Artifact upload version not found");

    return {
      artifactId: artifact._id,
      projectId: artifact.projectId,
      objectKey: version.objectKey,
      size: version.size,
      status: version.status,
      keyVaultRef: version.keyVaultRef,
    };
  },
});

/** Internal authorized record used by the download action. */
export const getDownloadRecord = internalQuery({
  args: { artifactId: v.id("artifacts") },
  returns: v.object({
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
  handler: async (ctx, args): Promise<{
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
    if (!artifact || !artifact.isActive) throw new ConvexError("Artifact not found");
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:read");

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
    objectKey: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    artifactId: Id<"artifacts">;
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    objectKey: string;
  }> => {
    const actor = await requireAuthedUser(ctx);
    const artifact = await ctx.db.get(args.artifactId);
    if (!artifact || !artifact.isActive) throw new ConvexError("Artifact not found");
    await assertProjectAction(ctx, actor._id, artifact.projectId, "project:delete_variable");

    const version = await ctx.db
      .query("artifactVersions")
      .withIndex("by_artifact_and_version", (q) =>
        q.eq("artifactId", artifact._id).eq("version", artifact.currentVersion)
      )
      .first();
    if (!version) throw new ConvexError("Artifact version not found");

    return {
      artifactId: artifact._id,
      projectId: artifact.projectId,
      organizationId: artifact.organizationId,
      objectKey: version.objectKey,
    };
  },
});
