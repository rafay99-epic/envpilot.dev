import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";

/**
 * Value hashes: HMAC-SHA256 of a secret's plaintext under a per-organization
 * key, stored against the vault object. Duplicate detection compares hashes
 * instead of reading the vault. A hash tells someone who can already read
 * both values that they are equal, and nothing else; the org key makes a
 * cross-org comparison meaningless by construction.
 */

async function hmacHex(key: string, value: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(value)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Record the hash for a freshly minted vault object. Never throws. */
export async function recordValueHash(
  ctx: ActionCtx,
  args: { organizationId: string; vaultRef: string; value: string }
): Promise<void> {
  try {
    const key: string | null = await ctx.runMutation(
      internal.features.vault.hashes._orgKey,
      { organizationId: args.organizationId, candidate: randomKey() }
    );
    if (!key) return;
    await ctx.runMutation(internal.features.vault.hashes._upsert, {
      organizationId: args.organizationId,
      vaultRef: args.vaultRef,
      hash: await hmacHex(key, args.value),
    });
  } catch {
    // A missing hash only means "compare on merge"; the write itself stands.
  }
}

/** The org's key, minting `candidate` when none exists yet. */
export const _orgKey = internalMutation({
  args: { organizationId: v.string(), candidate: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args): Promise<string | null> => {
    const id = ctx.db.normalizeId("organizations", args.organizationId);
    const org = id ? await ctx.db.get(id) : null;
    if (!org || !id) return null;
    if (org.hashKey) return org.hashKey;
    await ctx.db.patch(id, { hashKey: args.candidate });
    return args.candidate;
  },
});

export const _upsert = internalMutation({
  args: { organizationId: v.string(), vaultRef: v.string(), hash: v.string() },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const organizationId = ctx.db.normalizeId(
      "organizations",
      args.organizationId
    );
    if (!organizationId) return null;
    const existing = await ctx.db
      .query("vaultValueHashes")
      .withIndex("by_vault_ref", (q) => q.eq("vaultRef", args.vaultRef))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { hash: args.hash });
    } else {
      await ctx.db.insert("vaultValueHashes", {
        organizationId,
        vaultRef: args.vaultRef,
        hash: args.hash,
        createdAt: Date.now(),
      });
    }
    return null;
  },
});

const BACKFILL_PAGE = 100;

/** One page of active variables lacking a hash, for the backfill. */
export const _unhashedPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args
  ): Promise<{
    rows: { vaultRef: string; organizationId: Id<"organizations"> }[];
    cursor: string;
    done: boolean;
  }> => {
    const page = await ctx.db
      .query("environmentVariables")
      .paginate({ cursor: args.cursor, numItems: BACKFILL_PAGE });
    const rows = [];
    for (const row of page.page) {
      if (row.deletedAt) continue;
      const hashed = await ctx.db
        .query("vaultValueHashes")
        .withIndex("by_vault_ref", (q) => q.eq("vaultRef", row.vaultRef))
        .first();
      if (hashed) continue;
      const project = await ctx.db.get(row.projectId);
      if (!project) continue;
      rows.push({
        vaultRef: row.vaultRef,
        organizationId: project.organizationId,
      });
    }
    return { rows, cursor: page.continueCursor, done: page.isDone };
  },
});

/**
 * Backfill hashes for rows written before this table existed. Reads the
 * vault one page at a time and reschedules itself until done. Idempotent.
 */
export const backfill = internalAction({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const page = await ctx.runQuery(
      internal.features.vault.hashes._unhashedPage,
      { cursor: args.cursor }
    );
    for (const row of page.rows) {
      const value: string | null = await ctx
        .runAction(internal.features.vault.vault.readSecret, {
          vaultRef: row.vaultRef,
        })
        .catch(() => null);
      if (value === null) continue;
      await recordValueHash(ctx, { ...row, value });
    }
    if (!page.done) {
      await ctx.scheduler.runAfter(0, internal.features.vault.hashes.backfill, {
        cursor: page.cursor,
      });
    }
    return null;
  },
});
