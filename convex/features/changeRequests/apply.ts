import { ConvexError } from "convex/values";
import type { MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  createCore,
  updateCore,
  removeCore,
  restoreCore,
  rollbackCore,
} from "../variables/mutations";
import {
  createCore as createAccountCore,
  updateCore as updateAccountCore,
  removeCore as removeAccountCore,
  restoreCore as restoreAccountCore,
} from "../accounts/mutations";
import {
  createCore as createFileCore,
  replaceContentCore,
  updateCore as updateFileCore,
  removeCore as removeFileCore,
  restoreCore as restoreFileCore,
} from "../files/mutations";

/**
 * Replay an approved proposal through the resource's own core functions.
 *
 * Nothing is re-implemented here: the cores keep owning uniqueness, tier
 * limits, versioning and audit. `viaRequestId` is what carries the write
 * past lib/protection.ts, and the AUTHOR is the requester — the reviewer
 * only decided, and is recorded on the request and in the audit row.
 */

/** Non-secret fields a variable proposal carries. Values live in the vault. */
type VariablePayload = {
  key?: string;
  description?: string;
  environments?: string[];
  isSensitive?: boolean;
  tagIds?: string[];
  targetVersion?: number;
  rotationFrequencyDays?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parsePayload(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConvexError("This change request carries a malformed payload");
  }
  if (!isRecord(parsed)) {
    throw new ConvexError("This change request carries a malformed payload");
  }
  return parsed;
}

/** The environments a payload declares, when it declares any. */
export function payloadEnvironments(raw: string): string[] | undefined {
  const parsed = parsePayload(raw);
  return isStringArray(parsed.environments) ? parsed.environments : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

// Convex has no zod: a hand-written guard is the whole validator. Unknown
// fields are dropped rather than trusted.
function parseVariablePayload(raw: string): VariablePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConvexError("This change request carries a malformed payload");
  }
  if (!isRecord(parsed)) {
    throw new ConvexError("This change request carries a malformed payload");
  }
  return {
    key: typeof parsed.key === "string" ? parsed.key : undefined,
    description:
      typeof parsed.description === "string" ? parsed.description : undefined,
    environments: isStringArray(parsed.environments)
      ? parsed.environments
      : undefined,
    isSensitive:
      typeof parsed.isSensitive === "boolean" ? parsed.isSensitive : undefined,
    tagIds: isStringArray(parsed.tagIds) ? parsed.tagIds : undefined,
    targetVersion:
      typeof parsed.targetVersion === "number"
        ? parsed.targetVersion
        : undefined,
    rotationFrequencyDays:
      typeof parsed.rotationFrequencyDays === "number"
        ? parsed.rotationFrequencyDays
        : undefined,
  };
}

export async function applyChangeRequest(
  ctx: MutationCtx,
  request: Doc<"changeRequests">,
  reviewerId: Id<"users">
): Promise<string> {
  switch (request.resourceType) {
    case "variable":
      return applyVariableChange(ctx, request, reviewerId);
    case "account":
      return applyAccountChange(ctx, request);
    case "file":
      return applyFileChange(ctx, request);
    default: {
      const _exhaustive: never = request.resourceType;
      throw new ConvexError(
        `Unsupported resource type: ${String(_exhaustive)}`
      );
    }
  }
}

async function applyVariableChange(
  ctx: MutationCtx,
  request: Doc<"changeRequests">,
  reviewerId: Id<"users">
): Promise<string> {
  const payload = parseVariablePayload(request.payload);
  const author = request.requestedBy;
  const changeReason = `Applied change request ${request._id} (reviewed by ${reviewerId})`;

  const targetId =
    request.targetId !== undefined
      ? ctx.db.normalizeId("environmentVariables", request.targetId)
      : null;

  const tagIds = payload.tagIds
    ?.map((id) => ctx.db.normalizeId("variableTags", id))
    .filter((id): id is Id<"variableTags"> => id !== null);

  switch (request.kind) {
    case "create": {
      if (payload.key === undefined || request.vaultRef === undefined) {
        throw new ConvexError(
          "This change request has no key or staged value to apply"
        );
      }
      const variableId = await createCore(ctx, {
        key: payload.key,
        vaultRef: request.vaultRef,
        description: payload.description,
        environments: payload.environments ?? request.environments,
        projectId: request.projectId,
        isSensitive: payload.isSensitive,
        createdBy: author,
        rotationFrequencyDays: payload.rotationFrequencyDays,
        tagIds,
        viaRequestId: request._id,
      });
      return variableId;
    }
    case "update": {
      if (!targetId) {
        throw new ConvexError("The target variable no longer exists");
      }
      const variableId = await updateCore(ctx, {
        variableId: targetId,
        vaultRef: request.vaultRef,
        description: payload.description,
        environments: payload.environments,
        isSensitive: payload.isSensitive,
        rotationFrequencyDays: payload.rotationFrequencyDays,
        tagIds,
        updatedBy: author,
        changeReason,
        viaRequestId: request._id,
      });
      return variableId;
    }
    case "delete": {
      if (!targetId) {
        throw new ConvexError("The target variable no longer exists");
      }
      const variableId = await removeCore(ctx, {
        variableId: targetId,
        deletedBy: author,
        viaRequestId: request._id,
      });
      return variableId;
    }
    case "restore": {
      if (!targetId) {
        throw new ConvexError("The target variable no longer exists");
      }
      const variableId = await restoreCore(ctx, {
        variableId: targetId,
        restoredBy: author,
        viaRequestId: request._id,
      });
      return variableId;
    }
    case "rollback": {
      if (!targetId) {
        throw new ConvexError("The target variable no longer exists");
      }
      if (payload.targetVersion === undefined) {
        throw new ConvexError(
          "This rollback request does not name a version to restore"
        );
      }
      const result = await rollbackCore(ctx, {
        variableId: targetId,
        targetVersion: payload.targetVersion,
        actorId: author,
        viaRequestId: request._id,
      });
      return result.variableId;
    }
    default: {
      const _exhaustive: never = request.kind;
      throw new ConvexError(`Unsupported change kind: ${String(_exhaustive)}`);
    }
  }
}

async function applyAccountChange(
  ctx: MutationCtx,
  request: Doc<"changeRequests">
): Promise<string> {
  const payload = parsePayload(request.payload);
  const author = request.requestedBy;
  const environments = isStringArray(payload.environments)
    ? payload.environments
    : undefined;

  const targetId =
    request.targetId !== undefined
      ? ctx.db.normalizeId("projectAccounts", request.targetId)
      : null;

  switch (request.kind) {
    case "create": {
      const name = asString(payload.name);
      if (name === undefined || request.vaultRef === undefined) {
        throw new ConvexError(
          "This change request has no name or staged credentials to apply"
        );
      }
      return createAccountCore(ctx, {
        projectId: request.projectId,
        createdBy: author,
        name,
        websiteUrl: asString(payload.websiteUrl),
        description: asString(payload.description),
        environments: environments ?? request.environments,
        vaultRef: request.vaultRef,
        viaRequestId: request._id,
      });
    }
    case "update": {
      if (!targetId) {
        throw new ConvexError("The target account no longer exists");
      }
      return updateAccountCore(ctx, {
        accountId: targetId,
        userId: author,
        name: asString(payload.name),
        websiteUrl: asString(payload.websiteUrl),
        description: asString(payload.description),
        environments,
        credentialsChanged: request.vaultRef !== undefined,
        vaultRef: request.vaultRef,
        viaRequestId: request._id,
      });
    }
    case "delete": {
      if (!targetId) {
        throw new ConvexError("The target account no longer exists");
      }
      return removeAccountCore(ctx, {
        accountId: targetId,
        deletedBy: author,
        viaRequestId: request._id,
      });
    }
    case "restore": {
      if (!targetId) {
        throw new ConvexError("The target account no longer exists");
      }
      return restoreAccountCore(ctx, {
        accountId: targetId,
        restoredBy: author,
        viaRequestId: request._id,
      });
    }
    case "rollback":
      throw new ConvexError("Rollback is only supported for variables");
    default: {
      const _exhaustive: never = request.kind;
      throw new ConvexError(`Unsupported change kind: ${String(_exhaustive)}`);
    }
  }
}

async function applyFileChange(
  ctx: MutationCtx,
  request: Doc<"changeRequests">
): Promise<string> {
  const payload = parsePayload(request.payload);
  const author = request.requestedBy;
  const environments = isStringArray(payload.environments)
    ? payload.environments
    : undefined;

  const targetId =
    request.targetId !== undefined
      ? ctx.db.normalizeId("projectFiles", request.targetId)
      : null;

  switch (request.kind) {
    case "create": {
      const path = asString(payload.path);
      const name = asString(payload.name);
      const mode = asString(payload.mode);
      const size = asNumber(payload.size);
      const sha256 = asString(payload.sha256);
      const digestSalt = asString(payload.digestSalt);
      if (
        path === undefined ||
        name === undefined ||
        mode === undefined ||
        size === undefined ||
        sha256 === undefined ||
        digestSalt === undefined ||
        request.vaultRef === undefined ||
        request.storageId === undefined
      ) {
        throw new ConvexError(
          "This change request has no staged file contents to apply"
        );
      }
      return createFileCore(ctx, {
        projectId: request.projectId,
        createdBy: author,
        name,
        path,
        mode,
        contentType: asString(payload.contentType),
        description: asString(payload.description),
        environments: environments ?? request.environments,
        size,
        sha256,
        digestSalt,
        vaultRef: request.vaultRef,
        storageId: request.storageId,
        viaRequestId: request._id,
      });
    }
    case "update": {
      if (!targetId) {
        throw new ConvexError("The target file no longer exists");
      }
      // A staged blob means the proposal replaces the contents; without one
      // it is a metadata-only edit.
      if (request.vaultRef !== undefined && request.storageId !== undefined) {
        const size = asNumber(payload.size);
        const sha256 = asString(payload.sha256);
        const digestSalt = asString(payload.digestSalt);
        if (
          size === undefined ||
          sha256 === undefined ||
          digestSalt === undefined
        ) {
          throw new ConvexError(
            "This change request has no staged file contents to apply"
          );
        }
        const previous = await replaceContentCore(ctx, {
          fileId: targetId,
          userId: author,
          size,
          sha256,
          digestSalt,
          vaultRef: request.vaultRef,
          storageId: request.storageId,
          contentType: asString(payload.contentType),
          viaRequestId: request._id,
        });
        // The row now points at the staged pair, so the old one is
        // unreachable. Best effort, exactly like values.uploadFile.
        await ctx.storage.delete(previous.previousStorageId).catch(() => {});
        await ctx.scheduler.runAfter(
          0,
          internal.features.vault.vault.deleteSecret,
          { vaultRef: previous.previousVaultRef }
        );
        return targetId;
      }
      return updateFileCore(ctx, {
        fileId: targetId,
        userId: author,
        name: asString(payload.name),
        path: asString(payload.path),
        mode: asString(payload.mode),
        description: asString(payload.description),
        environments,
        viaRequestId: request._id,
      });
    }
    case "delete": {
      if (!targetId) {
        throw new ConvexError("The target file no longer exists");
      }
      return removeFileCore(ctx, {
        fileId: targetId,
        deletedBy: author,
        viaRequestId: request._id,
      });
    }
    case "restore": {
      if (!targetId) {
        throw new ConvexError("The target file no longer exists");
      }
      return restoreFileCore(ctx, {
        fileId: targetId,
        restoredBy: author,
        viaRequestId: request._id,
      });
    }
    case "rollback":
      throw new ConvexError("Rollback is only supported for variables");
    default: {
      const _exhaustive: never = request.kind;
      throw new ConvexError(`Unsupported change kind: ${String(_exhaustive)}`);
    }
  }
}
