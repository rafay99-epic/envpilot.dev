import { v } from "convex/values";
import { query, internalQuery } from "../../_generated/server";
import type { DatabaseReader, QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { getDefaultTierName } from "./tierLimits";
import { getUserTier } from "../featureRegistry/resolver";
import { requireAuthedUser } from "../../lib/identity";

/**
 * Subscription Management for Polar.sh Integration — read paths.
 *
 * USER-LEVEL BILLING: Subscriptions and Polar customers are keyed by
 * userId. The org owner's subscription determines the tier for all
 * their owned organizations via the userTiers table.
 */

// ==========================================
// DYNAMIC PRODUCT-TO-TIER MAPPING
// ==========================================

/**
 * Maps a Polar product ID to a tier name by looking up tierDefinitions.
 * Falls back to default tier if no match found.
 */
async function mapProductIdToTier(
  db: DatabaseReader,
  productId: string
): Promise<string> {
  // Strategy 1: Look up in paymentProducts table (provider-agnostic)
  const paymentProduct = await db
    .query("paymentProducts")
    .withIndex("by_product_id", (q) => q.eq("productId", productId))
    .first();
  if (paymentProduct && paymentProduct.isActive) return paymentProduct.tierName;

  // Strategy 2: Legacy fallback — tierDefinitions.polarProductId
  const allTiers = await db.query("tierDefinitions").collect();
  const match = allTiers.find((t) => t.polarProductId === productId);
  if (match) return match.name;

  return await getDefaultTierName(db);
}

// ==========================================
// QUERIES (public, read-only — safe)
// ==========================================

/**
 * Assert the JWT-verified actor is a member of the organization and return
 * the organization. Billing state is org-scoped-sensitive: members may read
 * their org's tier/subscription, outsiders may not.
 */
async function requireOrgMemberAndOrg(
  ctx: QueryCtx,
  actorId: Id<"users">,
  organizationId: Id<"organizations">
) {
  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", organizationId).eq("userId", actorId)
    )
    .first();
  if (!membership) {
    throw new Error("Not a member of this organization");
  }
  const organization = await ctx.db.get(organizationId);
  if (!organization) {
    throw new Error("Organization not found");
  }
  return organization;
}

/**
 * Get subscription for an organization (LEGACY — backward compat).
 * Membership-gated.
 */
export const getByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    await requireOrgMemberAndOrg(ctx, actor._id, args.organizationId);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
  },
});

/**
 * The caller's own subscription (self-service billing: cancel, portal).
 */
export const getOwn = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .first();
  },
});

/**
 * The org owner's subscription, readable by any member of that org — the
 * billing tab shows the org's effective plan to all members. The owner is
 * resolved server-side from organization.createdBy, never from the client.
 */
export const getForOrgOwner = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const organization = await requireOrgMemberAndOrg(
      ctx,
      actor._id,
      args.organizationId
    );
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", organization.createdBy))
      .first();
  },
});

/**
 * Get Polar customer for an organization (LEGACY — backward compat).
 * Membership-gated.
 */
export const getPolarCustomer = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    await requireOrgMemberAndOrg(ctx, actor._id, args.organizationId);
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .first();
  },
});

/**
 * The caller's own Polar customer record (self-service billing portal).
 */
export const getOwnPolarCustomer = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .first();
  },
});

/**
 * The org owner's Polar customer record, membership-gated (see
 * getForOrgOwner).
 */
export const getPolarCustomerForOrgOwner = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const organization = await requireOrgMemberAndOrg(
      ctx,
      actor._id,
      args.organizationId
    );
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_user", (q) => q.eq("userId", organization.createdBy))
      .first();
  },
});

// ==========================================
// INTERNAL QUERIES (used by processWebhookEvent action)
// ==========================================

export const _getPolarCustomerById = internalQuery({
  args: { polarCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("polarCustomers")
      .withIndex("by_polar_customer", (q) =>
        q.eq("polarCustomerId", args.polarCustomerId)
      )
      .first();
  },
});

export const _getByPolarSubscriptionId = internalQuery({
  args: { polarSubscriptionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscriptions")
      .withIndex("by_polar_subscription", (q) =>
        q.eq("polarSubscriptionId", args.polarSubscriptionId)
      )
      .first();
  },
});

export const _getOrgById = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.organizationId);
  },
});

/**
 * Get organizations owned by a user (for resolving org from user ID).
 * Used when subscription events don't include org metadata.
 */
export const _getUserOwnedOrgs = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("organizations")
      .withIndex("by_created_by", (q) => q.eq("createdBy", args.userId))
      .collect();
  },
});

/**
 * Dynamic product-to-tier mapping query (used in action context)
 */
export const _mapProductToTier = internalQuery({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    return await mapProductIdToTier(ctx.db, args.productId);
  },
});

/**
 * Get user's current tier name (used in action context)
 */
export const _getUserTierName = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await getUserTier(ctx.db, args.userId);
  },
});

// ==========================================
// WEBHOOK DEDUPLICATION
// ==========================================

export const _checkWebhookProcessed = internalQuery({
  args: { webhookId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedWebhookEvents")
      .withIndex("by_webhook_id", (q) => q.eq("webhookId", args.webhookId))
      .first();
    return !!existing;
  },
});

// ==========================================
// PAYMENT PRODUCTS (Provider-agnostic product mapping)
// ==========================================

/**
 * Get the active product ID for a given tier and provider.
 * Used by checkout route to find the correct Polar product.
 */
export const getProductIdForTier = query({
  args: {
    tierName: v.string(),
    provider: v.string(),
  },
  handler: async (ctx, args) => {
    const product = await ctx.db
      .query("paymentProducts")
      .withIndex("by_tier_and_provider", (q) =>
        q.eq("tierName", args.tierName).eq("provider", args.provider)
      )
      .first();
    return product?.isActive ? product.productId : null;
  },
});
