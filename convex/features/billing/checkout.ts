import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { normalizeOrgRole } from "../../lib/authz";
import { requireAuthedUser } from "../../lib/identity";

/**
 * Billing checkout — user-initiated actions.
 */

// ==========================================
// PUBLIC MUTATIONS (for user-initiated actions)
// ==========================================

/**
 * Store checkout session metadata
 * Called before redirecting to Polar checkout.
 * Now checks user-level subscription status alongside org-level.
 */
export const prepareCheckout = mutation({
  args: {
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    // Verify user is the organization owner
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();

    if (!membership || normalizeOrgRole(membership.role) !== "owner") {
      throw new Error("Only the organization owner can manage billing");
    }

    // The tier resolver derives an org's features from the CREATOR's
    // userTiers row (featureRegistry/resolver getOrgOwnerTier). A purchase
    // by any other owner-role member would land on the payer's userTiers
    // and never reach this org — paid, no features. Restrict purchase to
    // the account the resolver actually reads.
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }
    if (organization.createdBy !== actor._id) {
      throw new Error(
        "Only the organization's creating account can purchase a subscription for it — the org's tier is derived from that account"
      );
    }

    // Block double-subscribe. Scan ALL of the user's/org's subscription
    // rows: .first() returns the OLDEST row, so an old revoked row would
    // shadow a newer active one. A cancel-at-period-end subscription keeps
    // status "active" until the period ends and must also block.
    const isLive = (s: { status: string }) =>
      s.status === "active" || s.status === "trialing";

    const userSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    if (userSubscriptions.some(isLive)) {
      throw new Error("You already have an active subscription");
    }

    // Fallback: check org-level subscriptions (legacy)
    const orgSubscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();
    if (orgSubscriptions.some(isLive)) {
      throw new Error("Organization already has an active subscription");
    }

    // Get Polar customer — prefer user-level, fallback to org-level
    const userCustomer = await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .first();

    const orgCustomer = userCustomer
      ? null
      : await ctx.db
          .query("polarCustomers")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .first();

    return {
      organizationId: args.organizationId,
      polarCustomerId:
        userCustomer?.polarCustomerId || orgCustomer?.polarCustomerId || null,
    };
  },
});
