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
 * Maps a Polar product ID to a tier name, or null when the product is not
 * seeded anywhere. Activation paths MUST treat null as a hard error — a
 * silent default-tier fallback turns "product not seeded yet" into "customer
 * paid and got the free tier".
 */
async function mapProductIdToTierStrict(
  db: DatabaseReader,
  productId: string
): Promise<string | null> {
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

  return null;
}

/**
 * Maps a Polar product ID to a tier name by looking up tierDefinitions.
 * Falls back to default tier if no match found — display paths only; never
 * use this on a subscription-activation path (see mapProductIdToTierStrict).
 */
async function mapProductIdToTier(
  db: DatabaseReader,
  productId: string
): Promise<string> {
  const strict = await mapProductIdToTierStrict(db, productId);
  return strict ?? (await getDefaultTierName(db));
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
 * Pick the CURRENT subscription from a user's rows: a live one
 * (active/trialing) wins; otherwise the most recently updated. `.first()`
 * returns the oldest row, which lets a stale revoked subscription shadow a
 * newer active one.
 */
function pickCurrentSubscription<
  T extends { status: string; updatedAt: number },
>(subscriptions: T[]): T | null {
  if (subscriptions.length === 0) return null;
  const live = subscriptions.filter(
    (s) => s.status === "active" || s.status === "trialing"
  );
  const pool = live.length > 0 ? live : subscriptions;
  return pool.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
}

/**
 * The caller's own subscription (self-service billing: cancel, portal).
 */
export const getOwn = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", actor._id))
      .collect();
    return pickCurrentSubscription(subscriptions);
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
    const subscriptions = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", organization.createdBy))
      .collect();
    return pickCurrentSubscription(subscriptions);
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
 * Strict product→tier mapping for activation paths: null when the product is
 * not seeded (caller must throw so Polar retries — never grant a default).
 */
export const _mapProductToTierStrict = internalQuery({
  args: { productId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    return await mapProductIdToTierStrict(ctx.db, args.productId);
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
