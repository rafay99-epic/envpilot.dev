import { internalMutation } from "../../_generated/server";
import { createAuditLog } from "../../lib/audit";
import { normalizeResourceType } from "./helpers";

// ==========================================
// CRON HANDLERS (Internal Mutations)
// ==========================================

/**
 * Clean up expired shared secrets.
 * Transitions active shares past their expiresAt to "expired" status.
 */
export const cleanupExpiredShares = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Find active shares that have expired
    const expired = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "active").lt("expiresAt", now)
      )
      .collect();

    let count = 0;
    for (const share of expired) {
      await ctx.db.patch(share._id, {
        status: "expired",
      });

      // Audit log
      await createAuditLog(ctx, {
        organizationId: share.organizationId,
        projectId: share.projectId,
        variableId: share.variableId,
        userId: share.createdBy,
        action: "share.expired",
        details: {
          resourceType: normalizeResourceType(share),
          accountId: share.accountId,
          variableKey: share.variableKey,
          mode: share.mode,
          expiresAt: share.expiresAt,
        },
        involvesSensitiveData: true,
        resourceType: "security",
      });

      count++;
    }

    return { expired: count };
  },
});

/**
 * Clean up expired OTP codes from share recipients.
 * Clears OTP fields where the TTL has passed.
 */
export const cleanupExpiredOtps = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Only scan recipients whose OTP TTL has already elapsed, via the
    // by_otp_expires index. The `.gt(0)` floor matters: otpExpiresAt is
    // optional, and undefined sorts BELOW all numbers in the index — a bare
    // `.lt(now)` would read every recipient row that never had an OTP set
    // (the whole table's history) on every 30-minute run. Same floor trick
    // as variablePermissions/cleanup.ts and vault/gc.ts.
    const expiredRecipients = await ctx.db
      .query("shareRecipients")
      .withIndex("by_otp_expires", (q) =>
        q.gt("otpExpiresAt", 0).lt("otpExpiresAt", now)
      )
      .collect();

    let cleaned = 0;
    for (const recipient of expiredRecipients) {
      if (recipient.otpExpiresAt == null) continue;
      if (!recipient.otpCode) continue;
      await ctx.db.patch(recipient._id, {
        otpCode: undefined,
        otpExpiresAt: undefined,
      });
      cleaned++;
    }

    return { cleaned };
  },
});
