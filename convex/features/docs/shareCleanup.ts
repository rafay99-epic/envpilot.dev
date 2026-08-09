/**
 * Hourly expiry sweep for documentation shares.
 *
 * This is a bookkeeping pass, NOT a security boundary. `resolveShare` already
 * refuses a share past its TTL on every read, so a row this job has not
 * reached yet is already dead to readers. What the sweep buys is an accurate
 * "shared with" list and an active-link count that does not include corpses —
 * and `countActiveDocLinks` compensates for the gap in between by excluding
 * past-TTL rows itself.
 */
import { internal } from "../../_generated/api";
import { internalMutation } from "../../_generated/server";

/** Bounded per-run batch, same shape as the other cleanup crons. */
const SWEEP_BATCH = 200;

export const cleanupExpiredDocShares = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("docShares")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "active").lt("expiresAt", now)
      )
      .take(SWEEP_BATCH);

    for (const share of expired) {
      await ctx.db.patch(share._id, { status: "expired" });
    }

    // A full batch means there is more than one transaction's worth. Each
    // round patches rows OUT of the index range it reads, so the chain always
    // terminates; without it an organization expiring faster than the hourly
    // cadence would keep a permanent tail of dead rows marked active.
    const hadMore = expired.length === SWEEP_BATCH;
    if (hadMore) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.docs.shareCleanup.cleanupExpiredDocShares,
        {}
      );
    }

    return { expired: expired.length, hadMore };
  },
});
