import { ConvexError, v } from "convex/values";
import { action, internalQuery } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  assertKeyFormat,
  consumeRateLimit,
  hashToken,
  throwForDenial,
  type Authorization,
} from "../api/helpers";

const MAX_MACHINE_ARTIFACTS = 100;

type MachineArtifactRecord = {
  artifactId: Id<"artifacts">;
  name: string;
  fileName: string;
  contentType: string;
  contentHash: string;
  size: number;
  originalSize: number;
  version: number;
  updatedAt: number;
  objectKey: string;
  keyVaultRef: string;
};

type PreparedMachineArtifact = Omit<MachineArtifactRecord, "keyVaultRef"> & {
  encryptionKey: string;
};

type PreparedGithubActionPull = {
  project: { name: string; slug: string };
  artifacts: PreparedMachineArtifact[];
};

/** Bounded metadata/key-reference read after API-key authorization. */
export const _listMachineArtifacts = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      artifactId: v.id("artifacts"),
      name: v.string(),
      fileName: v.string(),
      contentType: v.string(),
      contentHash: v.string(),
      size: v.number(),
      originalSize: v.number(),
      version: v.number(),
      updatedAt: v.number(),
      objectKey: v.string(),
      keyVaultRef: v.string(),
    })
  ),
  handler: async (ctx, args): Promise<MachineArtifactRecord[]> => {
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "ready")
      )
      .order("desc")
      .take(MAX_MACHINE_ARTIFACTS + 1);

    if (artifacts.length > MAX_MACHINE_ARTIFACTS) {
      throw new ConvexError(
        `Project has more than ${MAX_MACHINE_ARTIFACTS} active artifacts — refusing a partial pull. Contact support to raise the limit.`
      );
    }

    const records: MachineArtifactRecord[] = [];
    for (const artifact of artifacts) {
      const version = await ctx.db
        .query("artifactVersions")
        .withIndex("by_artifact_and_version", (q) =>
          q
            .eq("artifactId", artifact._id)
            .eq("version", artifact.currentVersion)
        )
        .first();
      if (!version || version.status !== "ready") {
        throw new ConvexError(
          `Artifact "${artifact.name}" is not ready — refusing a partial pull`
        );
      }
      records.push({
        artifactId: artifact._id,
        name: artifact.name,
        fileName: version.fileName ?? artifact.fileName,
        contentType: artifact.contentType,
        contentHash: version.contentHash,
        size: version.size,
        originalSize: version.originalSize,
        version: version.version,
        updatedAt: artifact.updatedAt,
        objectKey: version.objectKey,
        keyVaultRef: version.keyVaultRef,
      });
    }
    return records;
  },
});

/**
 * GitHub Action artifact pull. The API key must be enabled for the Action,
 * carry the artifacts resource, and be scoped to exactly one project.
 */
export const prepareGithubActionPull = action({
  args: {
    token: v.string(),
    names: v.optional(v.array(v.string())),
  },
  returns: v.object({
    project: v.object({ name: v.string(), slug: v.string() }),
    artifacts: v.array(
      v.object({
        artifactId: v.id("artifacts"),
        name: v.string(),
        fileName: v.string(),
        contentType: v.string(),
        contentHash: v.string(),
        size: v.number(),
        originalSize: v.number(),
        version: v.number(),
        updatedAt: v.number(),
        objectKey: v.string(),
        encryptionKey: v.string(),
      })
    ),
  }),
  handler: async (ctx, args): Promise<PreparedGithubActionPull> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "cicdPull", tokenHash);

    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "artifacts" },
        surface: "github_action",
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);
    if (
      bootstrap.scopeProjects === "all" ||
      bootstrap.scopeProjects.length !== 1
    ) {
      throw new ConvexError(
        "GitHub Action artifact keys must be scoped to exactly one project"
      );
    }

    const projectId: Id<"projects"> = bootstrap.scopeProjects[0];
    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "artifacts", projectId },
        surface: "github_action",
        recordUse: {
          auditAction: "artifact.accessed",
          details: JSON.stringify({
            keyId: bootstrap.keyId,
            projectId,
            source: "github-action",
            requestedNames: args.names ?? null,
          }),
        },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);

    const project: {
      name: string;
      slug: string;
      deletedAt?: number;
    } | null = await ctx.runQuery(internal.features.projects.queries._getById, {
      projectId,
    });
    if (!project || project.deletedAt !== undefined) {
      throw new ConvexError("Project not found");
    }

    const requested =
      args.names && args.names.length > 0 ? new Set(args.names) : null;
    const records: MachineArtifactRecord[] = await ctx.runQuery(
      internal.features.artifacts.api._listMachineArtifacts,
      { projectId }
    );
    const filtered = requested
      ? records.filter(
          (record) =>
            requested.has(record.name) || requested.has(record.fileName)
        )
      : records;

    if (requested) {
      const found = new Set(
        filtered.flatMap((record) => [record.name, record.fileName])
      );
      const missing = [...requested].filter((name) => !found.has(name));
      if (missing.length > 0) {
        throw new ConvexError(
          `Artifact not found: ${missing.map((name) => `"${name}"`).join(", ")}`
        );
      }
    }

    const artifacts: PreparedMachineArtifact[] = [];
    for (const record of filtered) {
      let encryptionKey: string;
      try {
        encryptionKey = await ctx.runAction(
          internal.features.vault.vault.readSecret,
          { vaultRef: record.keyVaultRef }
        );
      } catch {
        throw new ConvexError(
          `Failed to decrypt artifact key for "${record.name}" — pull aborted`
        );
      }
      artifacts.push({
        artifactId: record.artifactId,
        name: record.name,
        fileName: record.fileName,
        contentType: record.contentType,
        contentHash: record.contentHash,
        size: record.size,
        originalSize: record.originalSize,
        version: record.version,
        updatedAt: record.updatedAt,
        objectKey: record.objectKey,
        encryptionKey,
      });
    }

    return {
      project: { name: project.name, slug: project.slug },
      artifacts,
    };
  },
});
