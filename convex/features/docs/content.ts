/**
 * The ONLY place doc bodies are read or written.
 *
 * `docContent` is split 1:1 out of `docs` because Convex bills bytes read and
 * the list views are reactive — an inline body would re-read every page in
 * the project on any write. The split only pays off if nothing bypasses this
 * module, hence one door. Also owns `excerpt` and `status` denormalization.
 */
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { buildExcerpt } from "./guards";

/** Read one doc's body. Returns "" when the row is missing (never throws). */
export async function readBody(
  ctx: QueryCtx | MutationCtx,
  docId: Id<"docs">
): Promise<string> {
  const row = await ctx.db
    .query("docContent")
    .withIndex("by_docId", (q) => q.eq("docId", docId))
    .first();
  return row?.body ?? "";
}

/** Create the body row. Always a draft — nothing publishes directly. */
export async function createBody(
  ctx: MutationCtx,
  docId: Id<"docs">,
  projectId: Id<"projects">,
  body: string
): Promise<string> {
  await ctx.db.insert("docContent", {
    docId,
    projectId,
    body,
    status: "draft",
  });
  return buildExcerpt(body);
}

/**
 * THE sync point for `docContent.status`, which exists only so the body
 * search index can pre-filter drafts. Dangerous if it drifts from
 * `docs.status`, so every status mutation calls this in the same
 * transaction and nothing else writes the field.
 */
export async function setContentStatus(
  ctx: MutationCtx,
  docId: Id<"docs">,
  status: "draft" | "published"
): Promise<void> {
  const row = await ctx.db
    .query("docContent")
    .withIndex("by_docId", (q) => q.eq("docId", docId))
    .first();
  if (row && row.status !== status) {
    await ctx.db.patch(row._id, { status });
  }
}

/** Returns the new excerpt, or null when byte-identical — callers skip the
 *  metadata patch, so an unchanged re-submit costs no writes. */
export async function writeBody(
  ctx: MutationCtx,
  docId: Id<"docs">,
  projectId: Id<"projects">,
  body: string
): Promise<string | null> {
  const row = await ctx.db
    .query("docContent")
    .withIndex("by_docId", (q) => q.eq("docId", docId))
    .first();

  if (!row) {
    // A missing body row is repaired, not failed.
    return await createBody(ctx, docId, projectId, body);
  }
  if (row.body === body) return null;

  await ctx.db.patch(row._id, { body });
  return buildExcerpt(body);
}

/** Hard-delete a doc's body row. Used by the purge cron and cascades. */
export async function deleteBody(
  ctx: MutationCtx,
  docId: Id<"docs">
): Promise<void> {
  const row = await ctx.db
    .query("docContent")
    .withIndex("by_docId", (q) => q.eq("docId", docId))
    .first();
  if (row) await ctx.db.delete(row._id);
}
