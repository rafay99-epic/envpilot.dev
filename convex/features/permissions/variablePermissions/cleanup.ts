import { v } from "convex/values";
import { internalMutation } from "../../../_generated/server";
import { Doc } from "../../../_generated/dataModel";
import { isCronPaused } from "../../../tierLimits";

/**
 * Runs are capped per invocation (mirrors vaultGc.PURGE_BATCH_SIZE): the work
 * per row here is a cheap patch + optional audit insert (not an external vault
 * call), so a larger batch is safe. Any remainder past this cap is picked up
 * by tomorrow's run — nothing is lost, just deferred by a day in a
 * pathological pile-up.
 */
const CLEANUP_BATCH_SIZE = 1000;

/**
 * Internal mutation to cleanup expired permissions
 * Should be called by a scheduled job, not directly by clients
 */
export const cleanupExpired = internalMutation({
  args: {},
  returns: v.object({ cleanedUp: v.number() }),
  handler: async (ctx) => {
    if (await isCronPaused(ctx.db, "cron_pause_cleanup_permissions")) {
      return { cleanedUp: 0 };
    }

    const now = Date.now();

    // Bounded by the by_active_and_expires index instead of a full
    // cross-tenant table scan. expiresAt is optional and undefined sorts
    // BELOW all numbers in Convex's index ordering (same trick already used
    // by vaultGc.by_deleted_at), so eq("isActive", true) + gt("expiresAt", 0)
    // + lte("expiresAt", now) reads ONLY grants that are active, DO carry an
    // expiry, AND have actually expired — permanent grants (the common case,
    // and the growing majority of this table) are never read at all. (A
    // previous comment here claimed an expiresAt index "would still scan"
    // permanent grants — that was true only for a naive `lte(now)` range with
    // no floor; the `gt(0)` floor is what excludes them, and this codebase
    // already relies on the identical trick for vault-GC.) Capped at
    // CLEANUP_BATCH_SIZE per run so a pathological expiry pile-up can't blow
    // the per-call read/write budget.
    const expiredPermissions = await ctx.db
      .query("variablePermissions")
      .withIndex("by_active_and_expires", (q) =>
        q.eq("isActive", true).gt("expiresAt", 0).lte("expiresAt", now)
      )
      .take(CLEANUP_BATCH_SIZE);

    // Cache project lookups so repeated variables don't re-fetch
    const projectCache = new Map<string, Doc<"projects"> | null>();

    let cleanedUp = 0;

    for (const perm of expiredPermissions) {
      await ctx.db.patch(perm._id, {
        isActive: false,
        revokedAt: now,
      });
      cleanedUp++;

      // Audit: permission expired (user-visible loss of access)
      const variable = await ctx.db.get(perm.variableId);
      if (!variable) continue;

      let project = projectCache.get(variable.projectId.toString());
      if (project === undefined) {
        project = await ctx.db.get(variable.projectId);
        projectCache.set(variable.projectId.toString(), project);
      }
      if (!project) continue;

      await ctx.db.insert("auditLogs", {
        organizationId: project.organizationId,
        projectId: variable.projectId,
        variableId: perm.variableId,
        userId: perm.userId,
        action: "permission.expired",
        details: JSON.stringify({
          permission: perm.permission,
          variableKey: variable.key,
          expiresAt: perm.expiresAt,
          grantedBy: perm.grantedBy,
        }),
        createdAt: now,
      });
    }

    return { cleanedUp };
  },
});
