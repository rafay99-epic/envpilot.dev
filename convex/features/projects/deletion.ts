import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import { del as deleteBlob } from "../files/blobStore";
import { deleteVaultObject } from "../vault/gc";

const EXTERNAL_BATCH_SIZE = 8;
const DATABASE_BATCH_SIZE = 64;
// Eight Vault calls can each consume the 10s provider timeout. Keep the lease
// above that worst case so the watchdog does not duplicate a healthy batch.
const EXTERNAL_LEASE_MS = 2 * 60_000;
const REVOCATION_EVENT_TTL_MS = 24 * 60 * 60 * 1000;

const externalStageValidator = v.union(
  v.literal("variables"),
  v.literal("accounts"),
  v.literal("files"),
  v.literal("requests"),
  v.literal("change_requests"),
  v.literal("shares")
);

type ExternalStage =
  | "variables"
  | "accounts"
  | "files"
  | "requests"
  | "change_requests"
  | "shares";

type DeletionStage =
  | ExternalStage
  | "doc_content"
  | "doc_shares"
  | "docs"
  | "favorites"
  | "workspace_links"
  | "members"
  | "access"
  | "api_keys"
  | "webhooks"
  | "invitations"
  | "finalize";

type ExternalResource = {
  id: string;
  kind: "root" | "version";
  vaultRefs: string[];
  storageId?: Id<"_storage">;
};

const NEXT_STAGE: Record<DeletionStage, DeletionStage | null> = {
  variables: "accounts",
  accounts: "files",
  files: "requests",
  requests: "change_requests",
  change_requests: "shares",
  shares: "doc_content",
  doc_content: "doc_shares",
  doc_shares: "docs",
  docs: "favorites",
  favorites: "workspace_links",
  workspace_links: "members",
  members: "access",
  access: "api_keys",
  api_keys: "webhooks",
  webhooks: "invitations",
  invitations: "finalize",
  finalize: null,
};

function isExternalStage(stage: DeletionStage): stage is ExternalStage {
  return (
    stage === "variables" ||
    stage === "accounts" ||
    stage === "files" ||
    stage === "requests" ||
    stage === "change_requests" ||
    stage === "shares"
  );
}

async function scheduleProcess(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  delay = 0
): Promise<void> {
  await ctx.scheduler.runAfter(
    delay,
    internal.features.projects.deletion.processDeletion,
    { projectId }
  );
}

async function advanceStage(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  stage: DeletionStage
): Promise<void> {
  const next = NEXT_STAGE[stage];
  if (!next) {
    await ctx.db.delete(projectId);
    return;
  }

  await ctx.db.patch(projectId, {
    deletionStage: next,
    deletionCursor: undefined,
    deletionLeaseUntil: undefined,
    deletionAttempts: 0,
  });
  await scheduleProcess(ctx, projectId);
}

async function listExternalResources(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  stage: ExternalStage
): Promise<ExternalResource[]> {
  if (stage === "variables") {
    const variable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .first();
    if (!variable) return [];

    const versions = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable", (q) => q.eq("variableId", variable._id))
      .take(EXTERNAL_BATCH_SIZE);
    if (versions.length > 0) {
      return versions.map((version) => ({
        id: version._id,
        kind: "version",
        vaultRefs: [version.vaultRef],
      }));
    }

    return [{ id: variable._id, kind: "root", vaultRefs: [variable.vaultRef] }];
  }

  if (stage === "accounts") {
    const accounts = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(EXTERNAL_BATCH_SIZE);
    return accounts.map((account) => ({
      id: account._id,
      kind: "root",
      vaultRefs: [account.vaultRef],
    }));
  }

  if (stage === "files") {
    const files = await ctx.db
      .query("projectFiles")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(EXTERNAL_BATCH_SIZE);
    return files.map((file) => ({
      id: file._id,
      kind: "root",
      vaultRefs: [file.vaultRef],
      storageId: file.storageId,
    }));
  }

  if (stage === "requests") {
    const requests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(EXTERNAL_BATCH_SIZE);
    return requests.map((request) => ({
      id: request._id,
      kind: "root",
      vaultRefs: request.vaultRef ? [request.vaultRef] : [],
    }));
  }

  if (stage === "change_requests") {
    // A pending proposal stages real secret material: the vault object for a
    // proposed value and, for files, the ciphertext blob.
    const requests = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) => q.eq("projectId", projectId))
      .take(EXTERNAL_BATCH_SIZE);
    return requests.map((request) => ({
      id: request._id,
      kind: "root",
      vaultRefs: request.vaultRef ? [request.vaultRef] : [],
      storageId: request.storageId,
    }));
  }

  const shares = await ctx.db
    .query("sharedSecrets")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .take(EXTERNAL_BATCH_SIZE);
  return shares.map((share) => ({
    id: share._id,
    kind: "root",
    vaultRefs: [share.vaultRef],
  }));
}

async function deleteProjectRows(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  stage: DeletionStage,
  actorId: Id<"users">
): Promise<boolean> {
  if (stage === "doc_content") {
    const rows = await ctx.db
      .query("docContent")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length > 0;
  }

  if (stage === "doc_shares") {
    const rows = await ctx.db
      .query("docShares")
      .withIndex("by_project_status", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length > 0;
  }

  if (stage === "docs") {
    const rows = await ctx.db
      .query("docs")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length > 0;
  }

  if (stage === "favorites") {
    const rows = await ctx.db
      .query("favoriteProjects")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length > 0;
  }

  if (stage === "workspace_links") {
    // Both directions in one stage: a deleted member project loses its
    // memberships, and a deleted workspace loses every project that read it.
    const asMember = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of asMember) await ctx.db.delete(row._id);
    if (asMember.length > 0) return true;

    const asWorkspace = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of asWorkspace) await ctx.db.delete(row._id);
    return asWorkspace.length > 0;
  }

  if (stage === "members") {
    const rows = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length > 0;
  }

  if (stage === "access") {
    const rows = await ctx.db
      .query("projectAccess")
      .withIndex("by_project", (q) => q.eq("projectId", projectId))
      .take(DATABASE_BATCH_SIZE);
    const now = Date.now();
    for (const row of rows) {
      if (row.isActive) {
        await ctx.db.insert("permissionRevocationEvents", {
          accessToken: row.accessToken,
          projectId,
          userId: row.userId,
          reason: "Project deleted",
          revokedBy: actorId,
          revokedAt: now,
          acknowledged: false,
          expiresAt: now + REVOCATION_EVENT_TTL_MS,
        });
      }
      await ctx.db.delete(row._id);
    }
    return rows.length > 0;
  }

  return false;
}

export const processDeletion = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const project = await ctx.db.get(args.projectId);
    if (!project?.deletedAt || !project.deletionStage) return null;

    const stage = project.deletionStage;
    const actorId = project.deletionStartedBy ?? project.createdBy;

    if (isExternalStage(stage)) {
      if (
        project.deletionLeaseUntil !== undefined &&
        project.deletionLeaseUntil > Date.now()
      ) {
        await scheduleProcess(
          ctx,
          args.projectId,
          project.deletionLeaseUntil - Date.now() + 1_000
        );
        return null;
      }

      const resources = await listExternalResources(ctx, args.projectId, stage);
      if (resources.length === 0) {
        await advanceStage(ctx, args.projectId, stage);
        return null;
      }

      const watchdogId = await ctx.scheduler.runAfter(
        EXTERNAL_LEASE_MS,
        internal.features.projects.deletion.processDeletion,
        { projectId: args.projectId }
      );
      await ctx.db.patch(args.projectId, {
        deletionLeaseUntil: Date.now() + EXTERNAL_LEASE_MS,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.features.projects.deletion.destroyExternalBatch,
        {
          projectId: args.projectId,
          stage,
          resources,
          isLastBatch:
            stage !== "variables" &&
            resources.length < EXTERNAL_BATCH_SIZE &&
            resources.every((resource) => resource.kind === "root"),
          watchdogId,
        }
      );
      return null;
    }

    if (
      stage === "doc_content" ||
      stage === "doc_shares" ||
      stage === "docs" ||
      stage === "favorites" ||
      stage === "workspace_links" ||
      stage === "members" ||
      stage === "access"
    ) {
      const deletedRows = await deleteProjectRows(
        ctx,
        args.projectId,
        stage,
        actorId
      );
      if (deletedRows) await scheduleProcess(ctx, args.projectId);
      else await advanceStage(ctx, args.projectId, stage);
      return null;
    }

    if (stage === "api_keys") {
      const page = await ctx.db
        .query("apiKeys")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", project.organizationId)
        )
        .paginate({ cursor: project.deletionCursor ?? null, numItems: 64 });
      const now = Date.now();
      for (const key of page.page) {
        if (
          key.scopeProjects === "all" ||
          !key.scopeProjects.includes(args.projectId)
        )
          continue;
        const remaining = key.scopeProjects.filter(
          (projectId) => projectId !== args.projectId
        );
        await ctx.db.patch(key._id, {
          scopeProjects: remaining,
          ...(remaining.length === 0 && key.revokedAt === undefined
            ? { revokedAt: now, revokedBy: actorId }
            : {}),
        });
      }
      if (page.isDone) await advanceStage(ctx, args.projectId, stage);
      else {
        await ctx.db.patch(args.projectId, {
          deletionCursor: page.continueCursor,
        });
        await scheduleProcess(ctx, args.projectId);
      }
      return null;
    }

    if (stage === "webhooks") {
      const page = await ctx.db
        .query("orgWebhooks")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", project.organizationId)
        )
        .paginate({ cursor: project.deletionCursor ?? null, numItems: 64 });
      for (const hook of page.page) {
        if (!hook.projectIds?.includes(args.projectId)) continue;
        const remaining = hook.projectIds.filter(
          (projectId) => projectId !== args.projectId
        );
        await ctx.db.patch(hook._id, {
          projectIds: remaining,
          ...(remaining.length === 0 ? { enabled: false } : {}),
        });
      }
      if (page.isDone) await advanceStage(ctx, args.projectId, stage);
      else {
        await ctx.db.patch(args.projectId, {
          deletionCursor: page.continueCursor,
        });
        await scheduleProcess(ctx, args.projectId);
      }
      return null;
    }

    if (stage === "invitations") {
      const page = await ctx.db
        .query("invitations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", project.organizationId)
        )
        .paginate({ cursor: project.deletionCursor ?? null, numItems: 64 });
      for (const invitation of page.page) {
        if (!invitation.projectIds?.includes(args.projectId)) continue;
        await ctx.db.patch(invitation._id, {
          projectIds: invitation.projectIds.filter(
            (projectId) => projectId !== args.projectId
          ),
        });
      }
      if (page.isDone) await advanceStage(ctx, args.projectId, stage);
      else {
        await ctx.db.patch(args.projectId, {
          deletionCursor: page.continueCursor,
        });
        await scheduleProcess(ctx, args.projectId);
      }
      return null;
    }

    await advanceStage(ctx, args.projectId, stage);
    return null;
  },
});

export const destroyExternalBatch = internalAction({
  args: {
    projectId: v.id("projects"),
    stage: externalStageValidator,
    resources: v.array(
      v.object({
        id: v.string(),
        kind: v.union(v.literal("root"), v.literal("version")),
        vaultRefs: v.array(v.string()),
        storageId: v.optional(v.id("_storage")),
      })
    ),
    isLastBatch: v.boolean(),
    watchdogId: v.id("_scheduled_functions"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const apiKey = process.env.WORKOS_API_KEY;
    const deletedResources: { id: string; kind: "root" | "version" }[] = [];

    for (const resource of args.resources) {
      if (resource.storageId) {
        const blobDeleted = await deleteBlob(ctx, resource.storageId);
        if (!blobDeleted) continue;
      }

      let allVaultRefsDeleted = true;
      for (const vaultRef of resource.vaultRefs) {
        if (!apiKey || !(await deleteVaultObject(vaultRef, apiKey))) {
          allVaultRefsDeleted = false;
        }
      }
      if (allVaultRefsDeleted) {
        deletedResources.push({ id: resource.id, kind: resource.kind });
      }
    }

    await ctx.runMutation(
      internal.features.projects.deletion.finishExternalBatch,
      {
        projectId: args.projectId,
        stage: args.stage,
        resources: deletedResources,
        resourceCount: args.resources.length,
        isLastBatch: args.isLastBatch,
      }
    );
    await ctx.scheduler.cancel(args.watchdogId);
    return null;
  },
});

export const finishExternalBatch = internalMutation({
  args: {
    projectId: v.id("projects"),
    stage: externalStageValidator,
    resources: v.array(
      v.object({
        id: v.string(),
        kind: v.union(v.literal("root"), v.literal("version")),
      })
    ),
    resourceCount: v.number(),
    isLastBatch: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const project = await ctx.db.get(args.projectId);
    if (
      !project?.deletedAt ||
      !project.deletionStage ||
      project.deletionStage !== args.stage
    ) {
      return null;
    }

    let allResourcesRemoved = true;
    for (const resource of args.resources) {
      const resourceId = resource.id;
      if (args.stage === "variables") {
        if (resource.kind === "version") {
          const version = await ctx.db.get(
            resourceId as Id<"variableVersions">
          );
          if (!version) continue;
          const variable = await ctx.db.get(version.variableId);
          if (variable?.projectId === args.projectId) {
            await ctx.db.delete(version._id);
          }
          continue;
        }

        const variableId = resourceId as Id<"environmentVariables">;
        const variable = await ctx.db.get(variableId);
        if (!variable || variable.projectId !== args.projectId) continue;
        const permissions = await ctx.db
          .query("variablePermissions")
          .withIndex("by_variable", (q) => q.eq("variableId", variableId))
          .take(DATABASE_BATCH_SIZE);
        for (const permission of permissions)
          await ctx.db.delete(permission._id);
        if (permissions.length === 0) await ctx.db.delete(variableId);
        else allResourcesRemoved = false;
      } else if (args.stage === "accounts") {
        const accountId = resourceId as Id<"projectAccounts">;
        const account = await ctx.db.get(accountId);
        if (!account || account.projectId !== args.projectId) continue;
        const permissions = await ctx.db
          .query("accountPermissions")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .take(DATABASE_BATCH_SIZE);
        for (const permission of permissions)
          await ctx.db.delete(permission._id);
        if (permissions.length === 0) await ctx.db.delete(accountId);
        else allResourcesRemoved = false;
      } else if (args.stage === "files") {
        const fileId = resourceId as Id<"projectFiles">;
        const file = await ctx.db.get(fileId);
        if (!file || file.projectId !== args.projectId) continue;
        const permissions = await ctx.db
          .query("filePermissions")
          .withIndex("by_file", (q) => q.eq("fileId", fileId))
          .take(DATABASE_BATCH_SIZE);
        for (const permission of permissions)
          await ctx.db.delete(permission._id);
        if (permissions.length === 0) await ctx.db.delete(fileId);
        else allResourcesRemoved = false;
      } else if (args.stage === "requests") {
        const requestId = resourceId as Id<"environmentVariableRequests">;
        const request = await ctx.db.get(requestId);
        if (!request || request.projectId !== args.projectId) continue;
        await ctx.db.delete(requestId);
      } else if (args.stage === "change_requests") {
        const requestId = resourceId as Id<"changeRequests">;
        const request = await ctx.db.get(requestId);
        if (!request || request.projectId !== args.projectId) continue;
        await ctx.db.delete(requestId);
      } else {
        const shareId = resourceId as Id<"sharedSecrets">;
        const share = await ctx.db.get(shareId);
        if (!share || share.projectId !== args.projectId) continue;
        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", shareId))
          .take(DATABASE_BATCH_SIZE);
        for (const recipient of recipients) await ctx.db.delete(recipient._id);
        if (recipients.length === 0) await ctx.db.delete(shareId);
        else allResourcesRemoved = false;
      }
    }

    const allDeleted = args.resources.length === args.resourceCount;
    if (allDeleted && allResourcesRemoved && args.isLastBatch) {
      await advanceStage(ctx, args.projectId, args.stage);
      return null;
    }

    const attempts = allDeleted ? 0 : (project.deletionAttempts ?? 0) + 1;
    await ctx.db.patch(args.projectId, {
      deletionLeaseUntil: undefined,
      deletionAttempts: attempts,
    });
    const retryDelay = allDeleted
      ? 0
      : Math.min(60_000 * 2 ** Math.min(attempts - 1, 5), 60 * 60 * 1000);
    await scheduleProcess(ctx, args.projectId, retryDelay);
    return null;
  },
});
