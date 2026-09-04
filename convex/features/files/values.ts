import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  digest,
  fromBase64,
  newDigestSalt,
  open,
  seal,
  toBase64,
} from "./crypto";
import * as blobStore from "./blobStore";
import { rateLimiter } from "../../lib/rateLimits";
import {
  PROTECTED_ENVIRONMENT_CODE,
  touchedEnvironments,
} from "../../lib/protection";
import { assertCanOverrideProtection } from "../changeRequests/override";

const sourceValidator = v.union(
  v.literal("web"),
  v.literal("cli"),
  v.literal("mcp"),
  v.literal("extension")
);

/**
 * The payload lib/protection.ts throws. Rebuilt here because this action
 * detects protection BEFORE anything is encrypted or stored, so a refused
 * upload leaves no blob and no vault object behind.
 */
function protectedEnvironmentError(environments: string[]) {
  const list = environments.join(", ");
  return {
    code: PROTECTED_ENVIRONMENT_CODE,
    message: `${list} ${environments.length === 1 ? "is a protected environment" : "are protected environments"}. Propose this change and a second person will apply it.`,
    environments,
  };
}

/**
 * Composed secret-file actions — the ONLY place plaintext and key material
 * meet.
 *
 * Both the browser and the session-authenticated clients (CLI, VS Code
 * extension) call these directly with a WorkOS JWT, exactly as they already
 * call features/variables/values:pullValues. There is no Next.js hop for
 * session auth; `/api/v1/files` exists only for `envpk_` API keys, and it
 * calls the same actions underneath.
 *
 * WRITE ORDER (non-negotiable):
 *   1. preflight — authz, tier gates, path conflict. Zero side effects.
 *   2. seal      — fresh AES key, fresh nonce, ciphertext in memory.
 *   3. blob      — ciphertext into storage.
 *   4. vault     — key material into WorkOS Vault.
 *   5. row       — pointers into Convex.
 * A failure at any step destroys what the earlier steps created, so a
 * rejected upload never leaves an orphaned blob or a live key to nothing.
 *
 * Reads never degrade: a missing blob or a failed decrypt THROWS. A partial
 * or zero-byte signing key is worse than a failed pull, because it fails
 * later and somewhere confusing.
 */

interface PreflightResult {
  name: string;
  path: string;
  mode: string;
  organizationId: Id<"organizations">;
  protectedEnvironments: string[];
  existingEnvironments?: string[];
}

interface UploadResult {
  fileId: Id<"projectFiles">;
  size: number;
  sha256: string;
}

/** Either the file was written, or a proposal was filed for it. */
type UploadOutcome =
  | UploadResult
  | { requested: true; requestId: Id<"changeRequests"> };

interface FileContentRefs {
  vaultRef: string;
  storageId: Id<"_storage">;
  name: string;
  path: string;
  mode: string;
  size: number;
  sha256: string;
  contentType?: string;
}

interface FileContentResult {
  name: string;
  path: string;
  mode: string;
  size: number;
  sha256: string;
  contentType?: string;
  content: string;
}

/** Resolve the caller's convex user _id from the verified JWT. Never an arg. */
async function requireCurrentUserId(ctx: ActionCtx): Promise<Id<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError(
      "Unauthenticated: no verified user identity on request"
    );
  }
  const user = await ctx.runQuery(api.features.users.users.getByWorkosId, {
    workosId: identity.subject,
  });
  if (!user) {
    throw new ConvexError("User not found");
  }
  return user._id;
}

/** Destroy a (blob, vault) pair. Best effort — GC reconciles stragglers. */
async function discardPair(
  ctx: ActionCtx,
  pair: { storageId?: Id<"_storage">; vaultRef?: string }
): Promise<void> {
  if (pair.storageId) {
    await blobStore.del(ctx, pair.storageId);
  }
  if (pair.vaultRef) {
    try {
      await ctx.runAction(internal.features.vault.vault.deleteSecret, {
        vaultRef: pair.vaultRef,
      });
    } catch {
      // Best effort — an orphaned key unlocks nothing.
    }
  }
}

/**
 * Upload a new secret file, or replace an existing file's contents.
 *
 * `content` is base64. The binding size limit is Convex's 16 MiB function
 * argument ceiling (~12 MB of file after base64 inflation); the tier's
 * `secret_files_max_bytes` is enforced well below that in preflight.
 */
export const uploadFile = action({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    path: v.string(),
    content: v.string(),
    mode: v.optional(v.string()),
    contentType: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    // Present to replace an existing file's contents in place.
    replaceFileId: v.optional(v.id("projectFiles")),
    // File a change request instead of failing when the write is protected.
    request: v.optional(v.boolean()),
    override: v.optional(v.boolean()),
    source: v.optional(sourceValidator),
  },
  returns: v.union(
    v.object({
      fileId: v.id("projectFiles"),
      size: v.number(),
      sha256: v.string(),
    }),
    v.object({ requested: v.literal(true), requestId: v.id("changeRequests") })
  ),
  // Explicit return type: the handler calls api.features.files.* — which
  // includes this action — so inference would be circular (TS7022).
  handler: async (ctx, args): Promise<UploadOutcome> => {
    const userId = await requireCurrentUserId(ctx);
    // Throttle BEFORE the encrypt/blob/vault work, not after — the point is
    // to stop a loop consuming storage and WorkOS calls at all.
    await rateLimiter.limit(ctx, "fileUpload", {
      key: userId,
      throws: true,
    });

    let plaintext: Uint8Array;
    try {
      plaintext = fromBase64(args.content);
    } catch {
      throw new ConvexError("File content is not valid base64");
    }

    // STEP 1 — everything that can say no, before anything that costs money
    // or leaves a trace. Returns the normalized values so the check and the
    // insert cannot disagree about what the path is, and the protected
    // environments, reported only AFTER access is verified, so an
    // unauthorized caller gets the ordinary access error instead of the
    // project's protection configuration.
    const preflight: PreflightResult = await ctx.runMutation(
      internal.features.files.mutations.preflightUpload,
      {
        projectId: args.projectId,
        userId,
        name: args.name,
        path: args.path,
        mode: args.mode,
        environments: args.environments,
        size: plaintext.length,
        replaceFileId: args.replaceFileId,
      }
    );

    const protectedEnvs = preflight.protectedEnvironments;
    const needsRequest = protectedEnvs.length > 0 && args.override !== true;
    if (needsRequest && args.request !== true) {
      throw new ConvexError(protectedEnvironmentError(protectedEnvs));
    }
    if (protectedEnvs.length > 0 && !needsRequest) {
      // Break-glass, authorized before the encrypt and the vault write.
      await assertCanOverrideProtection(ctx, userId, args.projectId);
    }

    // STEP 2 — fresh key, fresh nonce, every time. Never an in-place
    // re-encrypt, so (key, iv) reuse is unreachable rather than guarded.
    const digestSalt = newDigestSalt();
    const sha256 = await digest(plaintext, digestSalt);
    const sealed = await seal(plaintext);

    // STEP 3 — ciphertext to the blob store.
    const storageId = await blobStore.put(ctx, sealed.ciphertext);

    // STEP 4 — key material to WorkOS Vault. Convex never holds both.
    let vaultRef: string;
    try {
      const vault = await ctx.runAction(
        internal.features.vault.vault.createSecret,
        {
          name: `file:${preflight.path}`,
          value: sealed.keyMaterial,
          organizationId: preflight.organizationId,
          projectId: args.projectId,
          environment: "file",
        }
      );
      vaultRef = vault.id;
    } catch (vaultError) {
      await discardPair(ctx, { storageId });
      throw vaultError;
    }

    // STEP 5 — pointers into Convex, or a proposal that stages both refs
    // until a second person approves it.
    try {
      if (needsRequest) {
        const requestId: Id<"changeRequests"> = await ctx.runMutation(
          internal.features.changeRequests.mutations.createStaged,
          {
            projectId: args.projectId,
            resourceType: "file",
            kind: args.replaceFileId ? "update" : "create",
            targetId: args.replaceFileId,
            environments: touchedEnvironments(
              preflight.existingEnvironments,
              args.environments
            ),
            payload: JSON.stringify({
              name: preflight.name,
              path: preflight.path,
              mode: preflight.mode,
              contentType: args.contentType,
              size: plaintext.length,
              sha256,
              digestSalt,
              description: args.description,
              environments: args.environments,
            }),
            vaultRef,
            storageId,
            label: preflight.path,
            source: args.source ?? "web",
          }
        );
        return { requested: true as const, requestId };
      }

      if (args.replaceFileId) {
        const previous: {
          previousVaultRef: string;
          previousStorageId: Id<"_storage">;
        } = await ctx.runMutation(
          internal.features.files.mutations.replaceContent,
          {
            fileId: args.replaceFileId,
            userId,
            size: plaintext.length,
            sha256,
            digestSalt,
            vaultRef,
            storageId,
            contentType: args.contentType,
            override: args.override,
          }
        );
        // The row now points at the new pair, so the old one is unreachable
        // and safe to destroy. Order is blob then key: a crash in between
        // leaves a key to nothing, never bytes with a live key.
        await discardPair(ctx, {
          storageId: previous.previousStorageId,
          vaultRef: previous.previousVaultRef,
        });
        return { fileId: args.replaceFileId, size: plaintext.length, sha256 };
      }

      const fileId: Id<"projectFiles"> = await ctx.runMutation(
        internal.features.files.mutations.create,
        {
          projectId: args.projectId,
          createdBy: userId,
          name: preflight.name,
          path: preflight.path,
          mode: preflight.mode,
          contentType: args.contentType,
          description: args.description,
          environments: args.environments,
          size: plaintext.length,
          sha256,
          digestSalt,
          vaultRef,
          storageId,
          override: args.override,
        }
      );
      return { fileId, size: plaintext.length, sha256 };
    } catch (mutationError) {
      await discardPair(ctx, { storageId, vaultRef });
      throw mutationError;
    }
  },
});

/**
 * Decrypt and return ONE file. Audited on every call.
 *
 * One file per call by design: it bounds the response against Convex's
 * 16 MiB return ceiling, keeps a single huge file from breaking a pull of
 * all the others, and makes the audit trail per-file rather than per-batch.
 * Callers that only need to know whether their copy is stale should use the
 * `list` query and compare `sha256` — no decrypt required.
 */
export const getFileContent = action({
  args: {
    fileId: v.id("projectFiles"),
    // Free-form provenance for the audit row: "web", "cli", "extension".
    source: v.optional(v.string()),
  },
  returns: v.object({
    name: v.string(),
    path: v.string(),
    mode: v.string(),
    size: v.number(),
    sha256: v.string(),
    contentType: v.optional(v.string()),
    content: v.string(),
  }),
  // Explicit return type — see uploadFile.
  handler: async (ctx, args): Promise<FileContentResult> => {
    const userId = await requireCurrentUserId(ctx);
    await rateLimiter.limit(ctx, "fileDownload", {
      key: userId,
      throws: true,
    });

    // Authorization happens inside the internal query, which also hands back
    // the refs that the metadata queries deliberately never expose.
    const file: FileContentRefs = await ctx.runQuery(
      internal.features.files.queries._getForContent,
      { fileId: args.fileId, userId }
    );

    const ciphertext = await blobStore.get(ctx, file.storageId);
    const keyMaterial = await ctx.runAction(
      internal.features.vault.vault.readSecret,
      { vaultRef: file.vaultRef }
    );

    // A tampered or truncated blob throws here — the GCM tag is a free
    // integrity check and the throw is the whole point. Never caught.
    const plaintext = await open(ciphertext, keyMaterial);

    await ctx.runMutation(internal.features.files.mutations.logDownload, {
      fileId: args.fileId,
      userId,
      clientHint: args.source ?? "unknown",
    });

    return {
      name: file.name,
      path: file.path,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256,
      contentType: file.contentType,
      content: toBase64(plaintext),
    };
  },
});
