import { v } from "convex/values";
import { query } from "../../_generated/server";
import { requireAuthedUser } from "../../identity";
import { getVariableAccess } from "../../authz";
import {
  MAX_SHARE_SCAN,
  normalizeResourceType,
  buildShareAccessMaps,
  isShareAccessible,
} from "./helpers";

// ==========================================
// QUERIES
// ==========================================

/**
 * List shares for a specific variable, including recipient status.
 *
 * Authorization: the caller must have at least read access to the underlying
 * variable. The returned rows are stripped of the share `token` and `vaultRef`
 * — the UI only lists share status and never needs the lookup token or the
 * vault ciphertext reference.
 */
export const listByVariable = query({
  args: {
    variableId: v.id("environmentVariables"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Authorization: require variable access (read or write).
    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }
    const access = await getVariableAccess(ctx, actor._id, variable);
    if (!access) {
      throw new Error("You do not have access to this variable");
    }

    const shares = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
      .order("desc")
      .take(MAX_SHARE_SCAN);

    // Enrich with recipient data
    const result = await Promise.all(
      shares.map(async (share) => {
        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        // Strip the share token and vaultRef — never surfaced to the listing.
        const { token: _token, vaultRef: _vaultRef, ...safe } = share;

        return {
          ...safe,
          recipients: recipients.map((r) => ({
            email: r.email,
            hasViewed: r.hasViewed,
            viewedAt: r.viewedAt,
            otpVerified: r.otpVerified,
          })),
        };
      })
    );

    return result;
  },
});

/**
 * List active shares across an organization (for dashboard widget).
 */
export const listActiveByOrg = query({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Require org membership; each share also exposes a variableKey, so it is
    // only surfaced when the caller has access to the underlying variable.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!membership) return [];

    const shares = (
      await ctx.db
        .query("sharedSecrets")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .order("desc")
        .take(MAX_SHARE_SCAN)
    ).filter((share) => share.status === "active");

    // Resolve the caller's access to every referenced resource in one batched
    // pass per type instead of a full getX-Access fan-out per share.
    const { variableAccess, accountAccess } = await buildShareAccessMaps(
      ctx,
      actor._id,
      shares
    );

    const enriched = await Promise.all(
      shares.map(async (share) => {
        // Drop shares whose underlying resource the caller can't access.
        if (!isShareAccessible(share, variableAccess, accountAccess)) {
          return null;
        }

        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        return {
          _id: share._id,
          resourceType: normalizeResourceType(share),
          variableKey: share.variableKey,
          mode: share.mode,
          expiresAt: share.expiresAt,
          totalViewCount: share.totalViewCount,
          recipientCount: recipients.length,
          viewedCount: recipients.filter((r) => r.hasViewed).length,
          createdAt: share.createdAt,
          createdBy: share.createdBy,
        };
      })
    );

    return enriched.filter(
      (row): row is NonNullable<typeof row> => row !== null
    );
  },
});

/**
 * List all shares for a specific project (all statuses), sorted by most recent.
 * Enriched with recipient data for admin/team-lead dashboards.
 */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    // Require org membership before surfacing share metadata.
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!membership) return [];

    const shares = await ctx.db
      .query("sharedSecrets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(MAX_SHARE_SCAN);

    // Sort by createdAt descending (most recent first)
    shares.sort((a, b) => b.createdAt - a.createdAt);

    // Resolve the caller's access to every referenced resource in one batched
    // pass per type instead of a full getX-Access fan-out per share.
    const { variableAccess, accountAccess } = await buildShareAccessMaps(
      ctx,
      actor._id,
      shares
    );

    // Enrich with recipient data — drop shares whose underlying resource the
    // caller can't access (each row exposes variableKey + recipients).
    const enriched = await Promise.all(
      shares.map(async (share) => {
        if (!isShareAccessible(share, variableAccess, accountAccess)) {
          return null;
        }

        const recipients = await ctx.db
          .query("shareRecipients")
          .withIndex("by_share", (q) => q.eq("shareId", share._id))
          .collect();

        return {
          _id: share._id,
          resourceType: normalizeResourceType(share),
          variableKey: share.variableKey,
          mode: share.mode,
          status: share.status,
          expiresAt: share.expiresAt,
          hasPassphrase: share.hasPassphrase,
          totalViewCount: share.totalViewCount,
          createdAt: share.createdAt,
          createdBy: share.createdBy,
          recipients: recipients.map((r) => ({
            email: r.email,
            hasViewed: r.hasViewed,
            viewedAt: r.viewedAt,
            otpVerified: r.otpVerified,
          })),
        };
      })
    );

    return enriched.filter(
      (row): row is NonNullable<typeof row> => row !== null
    );
  },
});
