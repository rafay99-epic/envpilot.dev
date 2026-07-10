import { v } from "convex/values";
import { query, mutation } from "../../_generated/server";
import { verifyAdmin } from "./auth";

export const listTierDefinitions = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const tiers = await ctx.db.query("tierDefinitions").collect();
    // Sort by sortOrder
    return tiers.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const createTierDefinition = mutation({
  args: {
    secret: v.string(),
    name: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.number(),
    isDefault: v.boolean(),
    color: v.optional(v.string()),
    polarProductId: v.optional(v.string()),
    isComingSoon: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Validate unique name
    const existing = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();

    if (existing) {
      throw new Error(`A tier with name "${args.name}" already exists.`);
    }

    const now = Date.now();

    // If this tier is set as default, unset other defaults
    if (args.isDefault) {
      const allTiers = await ctx.db.query("tierDefinitions").collect();
      for (const t of allTiers) {
        if (t.isDefault) {
          await ctx.db.patch(t._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    return await ctx.db.insert("tierDefinitions", {
      name: args.name,
      displayName: args.displayName,
      description: args.description,
      sortOrder: args.sortOrder,
      isDefault: args.isDefault,
      color: args.color,
      polarProductId: args.polarProductId,
      isComingSoon: args.isComingSoon ?? false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateTierDefinition = mutation({
  args: {
    secret: v.string(),
    id: v.id("tierDefinitions"),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isDefault: v.optional(v.boolean()),
    color: v.optional(v.string()),
    polarProductId: v.optional(v.string()),
    isComingSoon: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Tier definition not found");
    }

    const now = Date.now();

    // If setting as default, unset other defaults
    if (args.isDefault === true) {
      const allTiers = await ctx.db.query("tierDefinitions").collect();
      for (const t of allTiers) {
        if (t.isDefault && t._id !== args.id) {
          await ctx.db.patch(t._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.displayName !== undefined) updates.displayName = args.displayName;
    if (args.description !== undefined) updates.description = args.description;
    if (args.sortOrder !== undefined) updates.sortOrder = args.sortOrder;
    if (args.isDefault !== undefined) updates.isDefault = args.isDefault;
    if (args.color !== undefined) updates.color = args.color;
    if (args.polarProductId !== undefined)
      updates.polarProductId = args.polarProductId;
    if (args.isComingSoon !== undefined)
      updates.isComingSoon = args.isComingSoon;

    await ctx.db.patch(args.id, updates);
  },
});

export const deleteTierDefinition = mutation({
  args: {
    secret: v.string(),
    id: v.id("tierDefinitions"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const tierDef = await ctx.db.get(args.id);
    if (!tierDef) {
      throw new Error("Tier definition not found");
    }

    // Prevent deleting the default tier
    if (tierDef.isDefault) {
      throw new Error(
        "Cannot delete the default tier. Set another tier as default first."
      );
    }

    // Check if any users are assigned this tier
    const userTiers = await ctx.db.query("userTiers").collect();
    const usedBy = userTiers.filter((ut) => ut.tier === tierDef.name);
    if (usedBy.length > 0) {
      throw new Error(
        `Cannot delete tier "${tierDef.name}": ${usedBy.length} user(s) are using it. Reassign them first.`
      );
    }

    // Clean up any tierFeatures records that reference this tier
    const tierFeatures = await ctx.db
      .query("tierFeatures")
      .withIndex("by_tier", (q) => q.eq("tierName", tierDef.name))
      .collect();
    for (const tf of tierFeatures) {
      await ctx.db.delete(tf._id);
    }

    await ctx.db.delete(args.id);
  },
});

// ==========================================
// PAYMENT PRODUCTS (Provider-agnostic product mapping)
// ==========================================

export const listPaymentProducts = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const products = await ctx.db.query("paymentProducts").collect();
    return products.sort((a, b) => a.tierName.localeCompare(b.tierName));
  },
});

export const createPaymentProduct = mutation({
  args: {
    secret: v.string(),
    tierName: v.string(),
    provider: v.string(),
    productId: v.string(),
    isActive: v.boolean(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Validate tier exists
    const tier = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.tierName))
      .first();
    if (!tier) {
      throw new Error(`Tier "${args.tierName}" does not exist`);
    }

    // Check for duplicate tier+provider mapping
    const existing = await ctx.db
      .query("paymentProducts")
      .withIndex("by_tier_and_provider", (q) =>
        q.eq("tierName", args.tierName).eq("provider", args.provider)
      )
      .first();
    if (existing) {
      throw new Error(
        `A product mapping already exists for tier "${args.tierName}" with provider "${args.provider}"`
      );
    }

    const now = Date.now();
    return await ctx.db.insert("paymentProducts", {
      tierName: args.tierName,
      provider: args.provider,
      productId: args.productId,
      isActive: args.isActive,
      label: args.label,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePaymentProduct = mutation({
  args: {
    secret: v.string(),
    id: v.id("paymentProducts"),
    productId: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Payment product not found");
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.productId !== undefined) updates.productId = args.productId;
    if (args.isActive !== undefined) updates.isActive = args.isActive;
    if (args.label !== undefined) updates.label = args.label;

    await ctx.db.patch(args.id, updates);
  },
});

export const deletePaymentProduct = mutation({
  args: {
    secret: v.string(),
    id: v.id("paymentProducts"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db.get(args.id);
    if (!existing) {
      throw new Error("Payment product not found");
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Seed payment products from existing tierDefinitions.polarProductId values.
 * This migrates the tightly-coupled polarProductId into the decoupled
 * paymentProducts table. Safe to run multiple times (idempotent).
 */
export const seedPaymentProducts = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const tiers = await ctx.db.query("tierDefinitions").collect();
    const existingProducts = await ctx.db.query("paymentProducts").collect();

    const now = Date.now();
    let created = 0;
    let skipped = 0;

    for (const tier of tiers) {
      if (!tier.polarProductId) continue;

      // Check if mapping already exists for this tier+polar
      const alreadyExists = existingProducts.some(
        (p) => p.tierName === tier.name && p.provider === "polar"
      );

      if (alreadyExists) {
        skipped++;
        continue;
      }

      await ctx.db.insert("paymentProducts", {
        tierName: tier.name,
        provider: "polar",
        productId: tier.polarProductId,
        isActive: true,
        label: `${tier.displayName} (Polar)`,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return {
      seeded: true,
      created,
      skipped,
      message: `Created ${created} payment product mappings, skipped ${skipped} existing`,
    };
  },
});

export const seedDefaultTiers = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db.query("tierDefinitions").collect();
    const existingByName = new Map(existing.map((t) => [t.name, t]));

    const now = Date.now();
    let created = 0;
    let updated = 0;

    const seedData = [
      {
        name: "free",
        displayName: "Free",
        description: "Basic tier with limited resources",
        sortOrder: 0,
        isDefault: true,
        color: "#71717a",
        polarProductId: "35d0b155-c28a-4cca-a5cf-bbb14f6ab23c",
        monthlyPrice: 0,
        badge: "Alpha \u00b7 Free during early access",
        badgeColor: "amber",
        ctaText: "Get Started Free",
        ctaLink: "/sign-up",
        isComingSoon: false,
        highlightFeatures: [
          "Up to 3 projects",
          "50 variables per project",
          "Up to 3 team members",
          "CLI + VS Code Extension",
          "Web Dashboard",
          "AES-256 encrypted vault",
          "Role-based access control",
          "7-day audit log retention",
        ],
      },
      {
        name: "pro",
        displayName: "Pro",
        description: "Professional tier with unlimited resources",
        sortOrder: 1,
        isDefault: false,
        color: "#a855f7",
        polarProductId: "d1edde6d-3201-4cec-b1e4-e053d7edba23",
        monthlyPrice: 15,
        badge: "Pro",
        badgeColor: "green",
        ctaText: "Upgrade to Pro",
        ctaLink: "/api/checkout?tier=pro",
        isComingSoon: false,
        highlightFeatures: [
          "Unlimited projects",
          "Unlimited variables",
          "Unlimited team members",
          "Version history & rollback",
          "Bulk .env import",
          "Granular permissions",
          "Secret rotation & expiry",
          "365-day audit log retention",
          "Priority support",
        ],
      },
    ];

    for (const tier of seedData) {
      const existing = existingByName.get(tier.name);
      if (existing) {
        // Upsert: update existing tier with new/changed fields
        await ctx.db.patch(existing._id, {
          ...tier,
          updatedAt: now,
        });
        updated++;
      } else {
        await ctx.db.insert("tierDefinitions", {
          ...tier,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }
    }

    // Also seed payment products from the tier definitions
    const existingProducts = await ctx.db.query("paymentProducts").collect();
    let productsCreated = 0;

    for (const tier of seedData) {
      if (!tier.polarProductId) continue;
      const alreadyExists = existingProducts.some(
        (p) => p.tierName === tier.name && p.provider === "polar"
      );
      if (alreadyExists) continue;

      await ctx.db.insert("paymentProducts", {
        tierName: tier.name,
        provider: "polar",
        productId: tier.polarProductId,
        isActive: true,
        label: `${tier.displayName} (Polar)`,
        createdAt: now,
        updatedAt: now,
      });
      productsCreated++;
    }

    return {
      seeded: true,
      message: `Tiers: ${created} created, ${updated} updated. Payment products: ${productsCreated} created.`,
    };
  },
});
