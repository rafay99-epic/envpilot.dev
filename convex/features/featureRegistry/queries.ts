import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { QueryCtx } from "../../_generated/server";
import { Id } from "../../_generated/dataModel";
import { isEnforcementEnabledFromDb } from "../billing/tierLimits";
import { requireAuthedUser } from "../../lib/identity";
import {
  parseFeatureValue,
  resolveFeatureValue,
  getUserTier,
  getOrgOwnerTier,
} from "./resolver";
import { checkBooleanFeature, checkNumericLimit } from "./gates";

// ==========================================
// QUERIES (exposed to client)
// ==========================================

/**
 * Universal feature check for any registered feature.
 * Replaces the hardcoded checkTierLimit for new code.
 */
export const checkFeature = query({
  args: {
    organizationId: v.id("organizations"),
    featureKey: v.string(),
    currentCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const feature = await ctx.db
      .query("featureRegistry")
      .withIndex("by_key", (q) => q.eq("key", args.featureKey))
      .first();

    if (!feature || !feature.isActive) {
      return { allowed: false, value: null, tierName: "unknown" };
    }

    if (feature.valueType === "boolean") {
      const result = await checkBooleanFeature(
        ctx.db,
        args.organizationId,
        args.featureKey
      );
      return { ...result, value: result.allowed };
    }

    if (feature.valueType === "numeric" && args.currentCount !== undefined) {
      const result = await checkNumericLimit(
        ctx.db,
        args.organizationId,
        args.featureKey,
        args.currentCount
      );
      return { ...result, value: result.limit };
    }

    // Numeric feature without currentCount — just return the limit value
    const resolved = await resolveFeatureValue(
      ctx.db,
      args.organizationId,
      args.featureKey
    );
    return {
      allowed: true,
      value: resolved.value,
      tierName: resolved.tierName,
    };
  },
});

/**
 * Bulk fetch all resolved features for an organization.
 * Used for rendering pricing pages, settings panels, etc.
 */
export const getResolvedFeatures = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const enforced = await isEnforcementEnabledFromDb(ctx.db);

    const allFeatures = await ctx.db
      .query("featureRegistry")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    if (!enforced) {
      // Return unlimited for everything
      const features: Record<
        string,
        {
          value: boolean | number | null;
          valueType: string;
          displayName: string;
          category: string;
        }
      > = {};
      for (const f of allFeatures) {
        features[f.key] = {
          value: f.valueType === "boolean" ? true : null,
          valueType: f.valueType,
          displayName: f.displayName,
          category: f.category,
        };
      }
      return { tierName: "unlimited", features };
    }

    const { tierName, ownerId } = await getOrgOwnerTier(
      ctx.db,
      args.organizationId,
      org
    );

    // Check grace period
    const grace = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", ownerId))
      .first();

    let effectiveTier = tierName;
    if (grace?.isActive && grace.gracePeriodEnd > Date.now()) {
      effectiveTier = grace.previousTier;
    }

    // Fetch all overrides for this tier
    const tierOverrides = await ctx.db
      .query("tierFeatures")
      .withIndex("by_tier", (q) => q.eq("tierName", effectiveTier))
      .collect();

    const overrideMap = new Map(
      tierOverrides.map((o) => [o.featureKey, o.value])
    );

    const features: Record<
      string,
      {
        value: boolean | number | null;
        valueType: string;
        displayName: string;
        category: string;
      }
    > = {};

    for (const f of allFeatures) {
      const rawValue = overrideMap.get(f.key) ?? f.defaultValue;
      const parsed = parseFeatureValue(rawValue, f.valueType);
      features[f.key] = {
        value: parsed,
        valueType: f.valueType,
        displayName: f.displayName,
        category: f.category,
      };
    }

    return { tierName: effectiveTier, features };
  },
});

/**
 * Batch version of getResolvedFeatures — resolves tiers for multiple
 * organizations in a single query. Use this when a caller would otherwise
 * loop with Promise.all over getResolvedFeatures (e.g. /api/auth/me which
 * fetches tiers for every org the user belongs to).
 *
 * Returns results in the same order as the input organizationIds.
 * Missing orgs return null in their slot.
 */
export const getResolvedFeaturesBatch = query({
  args: { organizationIds: v.array(v.id("organizations")) },
  handler: async (ctx, args) => {
    if (args.organizationIds.length === 0) return [];

    // Fetch shared data ONCE (instead of per-org)
    const enforced = await isEnforcementEnabledFromDb(ctx.db);
    const allFeatures = await ctx.db
      .query("featureRegistry")
      .withIndex("by_active", (q) => q.eq("isActive", true))
      .collect();

    // When enforcement is off, every org gets the same "unlimited" shape
    if (!enforced) {
      const features: Record<
        string,
        {
          value: boolean | number | null;
          valueType: string;
          displayName: string;
          category: string;
        }
      > = {};
      for (const f of allFeatures) {
        features[f.key] = {
          value: f.valueType === "boolean" ? true : null,
          valueType: f.valueType,
          displayName: f.displayName,
          category: f.category,
        };
      }
      return args.organizationIds.map(() => ({
        tierName: "unlimited",
        features,
      }));
    }

    // Resolve each org's effective tier (owner tier + grace period)
    const results = await Promise.all(
      args.organizationIds.map(async (organizationId) => {
        const org = await ctx.db.get(organizationId);
        if (!org) return null;

        const { tierName, ownerId } = await getOrgOwnerTier(
          ctx.db,
          organizationId,
          org
        );

        const grace = await ctx.db
          .query("subscriptionGracePeriods")
          .withIndex("by_user", (q) => q.eq("userId", ownerId))
          .first();

        let effectiveTier = tierName;
        if (grace?.isActive && grace.gracePeriodEnd > Date.now()) {
          effectiveTier = grace.previousTier;
        }

        return { organizationId, effectiveTier };
      })
    );

    // Group unique tiers so we only fetch each tier's overrides once
    const uniqueTiers = [
      ...new Set(
        results.filter((r) => r !== null).map((r) => r!.effectiveTier)
      ),
    ];
    const tierOverridesByTier = new Map<string, Map<string, string>>();
    await Promise.all(
      uniqueTiers.map(async (tier) => {
        const overrides = await ctx.db
          .query("tierFeatures")
          .withIndex("by_tier", (q) => q.eq("tierName", tier))
          .collect();
        tierOverridesByTier.set(
          tier,
          new Map(overrides.map((o) => [o.featureKey, o.value]))
        );
      })
    );

    return results.map((result) => {
      if (!result) return null;
      const overrideMap =
        tierOverridesByTier.get(result.effectiveTier) ?? new Map();
      const features: Record<
        string,
        {
          value: boolean | number | null;
          valueType: string;
          displayName: string;
          category: string;
        }
      > = {};
      for (const f of allFeatures) {
        const rawValue = overrideMap.get(f.key) ?? f.defaultValue;
        features[f.key] = {
          value: parseFeatureValue(rawValue, f.valueType),
          valueType: f.valueType,
          displayName: f.displayName,
          category: f.category,
        };
      }
      return { tierName: result.effectiveTier, features };
    });
  },
});

/**
 * Tier names only, for multiple organizations — the lean sibling of
 * getResolvedFeaturesBatch. Callers that use ONLY tierName (/api/auth/me
 * today; CLI listOrganizations and extension getOrganizations as they
 * migrate — PUBLISHED builds still call getResolvedFeaturesBatch by
 * baked-in path, so the fat batch must stay until minCli/minExtension
 * pass the migration) resolve the same effective tier (owner tier +
 * grace period) at ~4 docs per org instead of ~60.
 *
 * Returns results in input order; missing orgs return null in their slot.
 */
export const getOrgTiersBatch = query({
  args: { organizationIds: v.array(v.id("organizations")) },
  returns: v.array(v.union(v.null(), v.object({ tierName: v.string() }))),
  handler: async (ctx, args) => {
    if (args.organizationIds.length === 0) return [];

    const enforced = await isEnforcementEnabledFromDb(ctx.db);
    if (!enforced) {
      return args.organizationIds.map(() => ({ tierName: "unlimited" }));
    }

    return await Promise.all(
      args.organizationIds.map(async (organizationId) => {
        const org = await ctx.db.get(organizationId);
        if (!org) return null;

        const { tierName, ownerId } = await getOrgOwnerTier(
          ctx.db,
          organizationId,
          org
        );

        const grace = await ctx.db
          .query("subscriptionGracePeriods")
          .withIndex("by_user", (q) => q.eq("userId", ownerId))
          .first();

        const effectiveTier =
          grace?.isActive && grace.gracePeriodEnd > Date.now()
            ? grace.previousTier
            : tierName;

        return { tierName: effectiveTier };
      })
    );
  },
});

/**
 * Shared tier-info shape for a resolved user id. Callers must have already
 * established that the requester may see this user's tier.
 */
async function tierInfoForUser(ctx: QueryCtx, userId: Id<"users">) {
  const tier = await getUserTier(ctx.db, userId);
  const tierDef = await ctx.db
    .query("tierDefinitions")
    .withIndex("by_name", (q) => q.eq("name", tier))
    .first();

  const grace = await ctx.db
    .query("subscriptionGracePeriods")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  const graceActive =
    grace?.isActive === true && grace.gracePeriodEnd > Date.now();

  return {
    tier,
    tierDefinition: tierDef
      ? {
          name: tierDef.name,
          displayName: tierDef.displayName,
          description: tierDef.description,
          color: tierDef.color,
          sortOrder: tierDef.sortOrder,
        }
      : null,
    graceActive,
    gracePeriodEnd: graceActive ? grace!.gracePeriodEnd : undefined,
  };
}

/**
 * The caller's own tier info including grace period status (browser hooks:
 * tier badge, grace-period banner).
 */
export const getMyTierInfo = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    return tierInfoForUser(ctx, actor._id);
  },
});

/**
 * The org owner's tier info — what the billing tab shows every member as
 * the org's effective plan. Membership-gated; the owner is resolved
 * server-side from organization.createdBy, never from the client.
 */
export const getOrgOwnerTierInfo = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", actor._id)
      )
      .first();
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const organization = await ctx.db.get(args.organizationId);
    if (!organization) {
      throw new Error("Organization not found");
    }
    return tierInfoForUser(ctx, organization.createdBy);
  },
});

/**
 * Get a tier definition by name.
 */
export const getTierByName = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

/**
 * Get pricing data for the public pricing page.
 * Returns all tiers with their features, pricing, and marketing copy.
 * No auth required — this is public data.
 */
export const getPricingData = query({
  args: {},
  handler: async (ctx) => {
    // 1. Get all tier definitions, sorted
    const tiers = await ctx.db.query("tierDefinitions").collect();
    const sortedTiers = tiers.sort((a, b) => a.sortOrder - b.sortOrder);

    // 2. Get all feature registry entries (active only)
    const allFeatures = await ctx.db.query("featureRegistry").collect();
    const activeFeatures = allFeatures
      .filter((f) => f.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // 3. Get all tier-feature overrides
    const allTierFeatures = await ctx.db.query("tierFeatures").collect();

    // 4. Build pricing data for each tier
    const pricingTiers = sortedTiers.map((tier) => {
      const tierOverrides = allTierFeatures.filter(
        (tf) => tf.tierName === tier.name
      );
      const overrideMap = new Map(
        tierOverrides.map((tf) => [tf.featureKey, tf.value])
      );

      // Resolve each feature for this tier
      const features = activeFeatures.map((feature) => {
        const overrideValue = overrideMap.get(feature.key);
        const rawValue = overrideValue ?? feature.defaultValue;

        let resolvedValue: boolean | number | null;
        if (feature.valueType === "boolean") {
          resolvedValue = rawValue === "true";
        } else {
          resolvedValue = rawValue === "null" ? null : Number(rawValue);
        }

        return {
          key: feature.key,
          displayName: feature.displayName,
          description: feature.description,
          valueType: feature.valueType,
          category: feature.category,
          value: resolvedValue,
        };
      });

      return {
        name: tier.name,
        displayName: tier.displayName,
        description: tier.description,
        color: tier.color,
        sortOrder: tier.sortOrder,
        isDefault: tier.isDefault,
        monthlyPrice: tier.monthlyPrice ?? null,
        yearlyPrice: tier.yearlyPrice ?? null,
        badge: tier.badge,
        badgeColor: tier.badgeColor,
        ctaText: tier.ctaText,
        ctaLink: tier.ctaLink,
        isComingSoon: tier.isComingSoon ?? false,
        highlightFeatures: tier.highlightFeatures ?? [],
        features,
      };
    });

    // 5. Get feature categories for the comparison table
    const categories = [...new Set(activeFeatures.map((f) => f.category))];

    return {
      tiers: pricingTiers,
      categories,
      allFeatures: activeFeatures.map((f) => ({
        key: f.key,
        displayName: f.displayName,
        description: f.description,
        valueType: f.valueType,
        category: f.category,
      })),
    };
  },
});
