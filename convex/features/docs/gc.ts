/**
 * Trashed-doc purge. Same 7-day contract as variables/accounts/files, but a
 * plain mutation — a doc owns no vault object or blob, so there is nothing to
 * destroy outside Convex.
 */
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import { deleteBody } from "./content";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Bounded per-run batch. Docs accumulate far more slowly than variables, so
 * a modest ceiling keeps the daily job well inside one transaction while
 * still draining any realistic backlog over a few days.
 */
const PURGE_BATCH = 200;

export const purgeExpiredDocs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PURGE_RETENTION_DAYS * DAY_MS;

    // `by_deleted_at` is ordered by deletedAt with undefined sorting first,
    // so an open range would scan every live row before reaching the trash —
    // the explicit lower bound skips them (same caveat as the twin index on
    // environmentVariables).
    const expired = await ctx.db
      .query("docs")
      .withIndex("by_deleted_at", (q) =>
        q.gt("deletedAt", 0).lte("deletedAt", cutoff)
      )
      .take(PURGE_BATCH);

    let purged = 0;
    for (const doc of expired) {
      // Body first, then the row: a body orphaned by a mid-run failure is
      // unreachable but harmless, whereas a doc row whose body vanished
      // would render as an empty page.
      await deleteBody(ctx, doc._id);
      await ctx.db.delete(doc._id);
      purged++;
    }

    return { purged, hadMore: expired.length === PURGE_BATCH };
  },
});

/**
 * Purge every trashed doc in ONE project, now — the docs half of
 * `vault/gc.ts::emptyProjectTrash`.
 *
 * A single mutation rather than a per-row loop in that action because a doc
 * owns no Vault object and no blob: there is no external delete that can
 * half-succeed, so nothing to retry per row. Authorization is the caller's —
 * `emptyProjectTrash` has already run `authorizeEmptyTrash` for this project
 * before reaching here.
 */
export const purgeProjectDocs = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.object({ purged: v.number(), hadMore: v.boolean() }),
  handler: async (ctx, args) => {
    // Lower bound instead of a filter: `undefined` sorts first, so an open
    // range would read every live doc just to discard it.
    const trashed = await ctx.db
      .query("docs")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gt("deletedAt", 0)
      )
      .take(PURGE_BATCH);

    let purged = 0;
    for (const doc of trashed) {
      await deleteBody(ctx, doc._id);
      await ctx.db.delete(doc._id);
      purged++;
    }

    // A full batch means more trash than one transaction should hold. The
    // CALLER re-invokes rather than this rescheduling itself: the caller is
    // an action, so it can loop across transactions and report a true total.
    // A background continuation would let "Empty trash" audit a partial count
    // and call itself done. Each round deletes rows, so the loop terminates.
    return { purged, hadMore: trashed.length === PURGE_BATCH };
  },
});
