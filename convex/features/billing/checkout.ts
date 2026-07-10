import { v } from "convex/values";
import { mutation } from "../../_generated/server";
import { normalizeOrgRole } from "../../authz";
import { requireAuthedUser } from "../../identity";

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

    // Check if user already has active subscription
    const userSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .first();

    if (
      userSubscription &&
      (userSubscription.status === "active" ||
        userSubscription.status === "trialing")
    ) {
      throw new Error("You already have an active subscription");
    }

    // Fallback: check org-level subscription (legacy)
    const orgSubscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();

    if (
      orgSubscription &&
      (orgSubscription.status === "active" ||
        orgSubscription.status === "trialing")
    ) {
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
