import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser, getAuthedUser } from "../../lib/identity";

/**
 * Membership tombstones — exit records shown to a user whose membership
 * ended (removed / left / org deleted), so the next sign-in says "your
 * access to X has been revoked — contact your organization" instead of the
 * org silently vanishing. The user sees org name + date + kind only; who/why
 * lives in the admin audit log. See schema.ts `membershipTombstones`.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Record an exit for (org, user). Replaces any previous unacknowledged
 * tombstone for the same pair so the user only ever sees the latest exit.
 * Call from the mutations that end a membership — never throws the caller's
 * transaction away for a bookkeeping row (no external calls, plain inserts).
 */
export async function writeTombstone(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    organizationId: Id<"organizations">;
    organizationName: string;
    kind: "removed" | "left" | "org_deleted";
  }
): Promise<void> {
  const existing = await ctx.db
    .query("membershipTombstones")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", args.organizationId).eq("userId", args.userId)
    )
    .collect();
  for (const row of existing) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.insert("membershipTombstones", {
    userId: args.userId,
    organizationId: args.organizationId,
    organizationName: args.organizationName,
    kind: args.kind,
    createdAt: Date.now(),
    acknowledged: false,
  });
}

/**
 * Void any tombstone for (org, user) — the user was re-invited and accepted,
 * so the exit notice no longer applies.
 */
export async function voidTombstones(
  ctx: MutationCtx,
  organizationId: Id<"organizations">,
  userId: Id<"users">
): Promise<void> {
  const rows = await ctx.db
    .query("membershipTombstones")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", userId)
    )
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/**
 * The caller's own unacknowledged exit notices. Powers the dashboard
 * interstitial. Deliberately org-data-free: name snapshot + date + kind.
 */
export const myTombstones = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("membershipTombstones"),
      organizationName: v.string(),
      kind: v.union(
        v.literal("removed"),
        v.literal("left"),
        v.literal("org_deleted")
      ),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    // Mounted on every dashboard page (AccessNotices) — it races the JWT
    // being attached to the Convex client on load. No identity yet is a
    // normal transient state, not an error: return empty, never throw.
    const actor = await getAuthedUser(ctx);
    if (!actor) return [];
    const rows = await ctx.db
      .query("membershipTombstones")
      .withIndex("by_user", (q) =>
        q.eq("userId", actor._id).eq("acknowledged", false)
      )
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      organizationName: row.organizationName,
      kind: row.kind,
      createdAt: row.createdAt,
    }));
  },
});

/** Acknowledge (dismiss) an exit notice. Only the addressee can. */
export const acknowledgeTombstone = mutation({
  args: { tombstoneId: v.id("membershipTombstones") },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const row = await ctx.db.get(args.tombstoneId);
    if (!row || row.userId !== actor._id) {
      throw new Error("Notice not found");
    }
    if (!row.acknowledged) {
      await ctx.db.patch(args.tombstoneId, { acknowledged: true });
    }
    return { success: true };
  },
});

/** Cron: delete acknowledged tombstones older than 30 days. */
export const cleanupAcknowledged = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const rows = await ctx.db
      .query("membershipTombstones")
      .withIndex("by_acknowledged", (q) =>
        q.eq("acknowledged", true).lt("createdAt", cutoff)
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return { deleted: rows.length };
  },
});
