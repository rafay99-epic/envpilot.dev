/**
 * The ONLY place doc bodies are read or written.
 *
 * `docContent` is split 1:1 out of `docs` because Convex bills bytes READ and
 * the sidebar, module index and command palette are reactive subscriptions:
 * if the body lived on the metadata row, every one of those queries would
 * re-read every markdown body in the project on any write. Keeping the two
 * apart only pays off if nothing bypasses this module and reads the body
 * inside a list — hence one door.
 *
 * This module also owns the invariants that keep the split honest: the
 * denormalized `excerpt`, and the unchanged-body short-circuit (a plain
 * string compare — the row is already in hand, so a hash would add a
 * collision risk to save nothing).
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

/**
 * Create the body row for a freshly inserted doc. Returns the excerpt.
 * Always starts as a draft — nothing creates a published page directly.
 */
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
 * Mirror a status change onto the body row.
 *
 * THE sync point for `docContent.status`. It exists only to let the body
 * search index pre-filter drafts, and it is worthless — worse, dangerous —
 * if it drifts from `docs.status`, so every mutation that changes status
 * calls this in the same transaction. Nothing else may write the field.
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

/**
 * Replace a doc's body.
 *
 * Returns the new excerpt, or `null` when the body is byte-identical to what
 * is already stored — callers use that to skip the metadata patch entirely,
 * so an agent re-submitting an unchanged page costs one read and no writes.
 */
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
    // Defensive: a doc whose body row went missing is repaired, not failed.
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
