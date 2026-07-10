import { internalMutation } from "../../../_generated/server";

/**
 * Auto-publish scheduled changelog entries.
 * Called by cron every 5 minutes. Finds entries with publishStatus === "scheduled"
 * and scheduledFor <= now, then publishes them.
 */
export const publishScheduledEntries = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    const scheduled = await ctx.db
      .query("changelog")
      .withIndex("by_publish_status", (q) => q.eq("publishStatus", "scheduled"))
      .collect();

    let published = 0;
    for (const entry of scheduled) {
      if (entry.scheduledFor && entry.scheduledFor <= now) {
        await ctx.db.patch(entry._id, {
          isPublished: true,
          publishedAt: entry.scheduledFor,
          publishStatus: "published",
          updatedAt: now,
        });
        published++;
      }
    }

    return { published };
  },
});
