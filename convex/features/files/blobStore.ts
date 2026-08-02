import type { ActionCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * The blob seam.
 *
 * Ciphertext storage is deliberately behind three functions so the backing
 * store is one file's worth of change rather than a migration. Today that is
 * Convex file storage (already provisioned, already billed, no new vendor,
 * no new credential to rotate). The documented swap trigger is total file
 * storage crossing 5 GB or egress crossing 20 GB/month — at which point
 * Cloudflare R2's zero-egress pricing starts to matter and this module gets a
 * SigV4 implementation instead of `ctx.storage`.
 *
 * Nothing above this file knows which store is in use: crypto.ts never sees a
 * storage id, and the GC only cares that `del` reports success.
 *
 * ponytail: Convex storage until the trigger fires. Swapping means rewriting
 * these three functions and widening `storageId` to an opaque string.
 */

export async function put(
  ctx: ActionCtx,
  ciphertext: Uint8Array
): Promise<Id<"_storage">> {
  // Copy into a fresh ArrayBuffer: a Uint8Array view may be a window onto a
  // larger buffer, and Blob would then store the whole thing.
  const blob = new Blob([new Uint8Array(ciphertext)], {
    type: "application/octet-stream",
  });
  return await ctx.storage.store(blob);
}

export async function get(
  ctx: ActionCtx,
  storageId: Id<"_storage">
): Promise<Uint8Array> {
  const blob = await ctx.storage.get(storageId);
  if (!blob) {
    // The row points at a blob that is gone. Never degrade to an empty file —
    // a zero-byte keystore fails in a confusing place much later.
    throw new Error("File content is missing from storage (code=blob_missing)");
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Best-effort delete. Returns false instead of throwing so the GC can leave
 * the row in place and retry on the next sweep — an orphaned blob costs
 * storage and leaks nothing, whereas a hard-deleted row whose blob survived
 * is unrecoverable.
 */
export async function del(
  ctx: ActionCtx,
  storageId: Id<"_storage">
): Promise<boolean> {
  try {
    await ctx.storage.delete(storageId);
    return true;
  } catch (error) {
    console.warn(
      `Secret file blob delete failed (storageId=${storageId}): ${
        error instanceof Error ? error.message : "unknown"
      }`
    );
    return false;
  }
}
