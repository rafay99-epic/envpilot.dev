import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { requireAdmin } from "./auth";

/** List all registered features (developer-seeded, admin can only toggle active) */
export const listFeatureRegistry = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const features = await ctx.db.query("featureRegistry").collect();
    return features.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Toggle a feature active/inactive */
export const toggleFeatureActive = mutation({
  args: {
    featureId: v.id("featureRegistry"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await ctx.db.patch(args.featureId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

// ==========================================
// TIER-FEATURE CONFIGURATION (the matrix)
// ==========================================

/** Get all tier-feature overrides, optionally filtered by tier */
export const listTierFeatures = query({
  args: { tierName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.tierName) {
      return await ctx.db
        .query("tierFeatures")
        .withIndex("by_tier", (q) => q.eq("tierName", args.tierName!))
        .collect();
    }
    return await ctx.db.query("tierFeatures").collect();
  },
});

/** Set a single tier-feature value (the core admin action) */
export const setTierFeatureValue = mutation({
  args: {
    tierName: v.string(),
    featureKey: v.string(),
    value: v.string(), // "true", "false", "50", "null"
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();

    // Validate feature exists
    const feature = await ctx.db
      .query("featureRegistry")
      .withIndex("by_key", (q) => q.eq("key", args.featureKey))
      .first();
    if (!feature) {
      throw new Error(`Feature "${args.featureKey}" not found in registry`);
    }

    // Validate tier exists
    const tier = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.tierName))
      .first();
    if (!tier) {
      throw new Error(`Tier "${args.tierName}" not found`);
    }

    // Validate value matches feature type
    if (feature.valueType === "boolean") {
      if (args.value !== "true" && args.value !== "false") {
        throw new Error(
          `Boolean feature "${args.featureKey}" requires "true" or "false"`
        );
      }
    } else if (feature.valueType === "numeric") {
      if (args.value !== "null") {
        const n = parseInt(args.value, 10);
        if (isNaN(n) || n < 0) {
          throw new Error(
            `Numeric feature "${args.featureKey}" requires a non-negative number or "null"`
          );
        }
      }
    }

    // Upsert
    const existing = await ctx.db
      .query("tierFeatures")
      .withIndex("by_tier_and_feature", (q) =>
        q.eq("tierName", args.tierName).eq("featureKey", args.featureKey)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("tierFeatures", {
        tierName: args.tierName,
        featureKey: args.featureKey,
        value: args.value,
        updatedAt: now,
      });
    }
  },
});

/** Remove a tier-feature override (reverts to default from featureRegistry) */
export const removeTierFeatureOverride = mutation({
  args: {
    tierName: v.string(),
    featureKey: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const existing = await ctx.db
      .query("tierFeatures")
      .withIndex("by_tier_and_feature", (q) =>
        q.eq("tierName", args.tierName).eq("featureKey", args.featureKey)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
