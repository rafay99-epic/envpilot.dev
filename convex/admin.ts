import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { SEED_CHANGELOG } from "./changelog";
import { SEED_FEATURE_REQUESTS } from "./featureRequests";

// ==========================================
// HELPERS
// ==========================================

function verifyAdmin(secret: string) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret || secret !== adminSecret) {
    throw new Error("Unauthorized: Invalid admin secret");
  }
}

const BROWSABLE_TABLES = [
  "users",
  "userPreferences",
  "organizations",
  "organizationMembers",
  "projects",
  "favoriteProjects",
  "projectMembers",
  "environmentVariables",
  "environmentVariableRequests",
  "variableVersions",
  "variablePermissions",
  "projectAccess",
  "invitations",
  "featureRequests",
  "featureVotes",
  "changelog",
  "auditLogs",
  "subscriptions",
  "polarCustomers",
  "cliSessions",
  "cliTokens",
  "environmentTemplates",
  "templateVariables",
  "permissionRevocationEvents",
  "supportTickets",
  "contactMessages",
  "tierDefinitions",
  "organizationTiers",
  "adminSettings",
  "paymentProducts",
  "processedWebhookEvents",
] as const;

// ==========================================
// AUTH
// ==========================================

export const verifySecret = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    const adminSecret = process.env.ADMIN_SECRET;
    return { valid: !!adminSecret && args.secret === adminSecret };
  },
});

// ==========================================
// DASHBOARD
// ==========================================

export const getStats = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const users = await ctx.db.query("users").take(10000);
    const organizations = await ctx.db.query("organizations").take(10000);
    const projects = await ctx.db.query("projects").take(10000);

    const unreadMessages = await ctx.db
      .query("contactMessages")
      .withIndex("by_is_read", (q) => q.eq("isRead", false))
      .collect();

    const openTickets = await ctx.db
      .query("supportTickets")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const featureRequests = await ctx.db.query("featureRequests").collect();
    const featureRequestsByStatus: Record<string, number> = {};
    for (const fr of featureRequests) {
      featureRequestsByStatus[fr.status] =
        (featureRequestsByStatus[fr.status] || 0) + 1;
    }

    const userTiers = await ctx.db.query("userTiers").collect();
    const tierDistribution: Record<string, number> = {};
    for (const ut of userTiers) {
      tierDistribution[ut.tier] = (tierDistribution[ut.tier] || 0) + 1;
    }

    return {
      totalUsers: users.length,
      totalOrganizations: organizations.length,
      totalProjects: projects.length,
      unreadMessages: unreadMessages.length,
      openTickets: openTickets.length,
      totalFeatureRequests: featureRequests.length,
      featureRequestsByStatus,
      tierDistribution,
    };
  },
});

// ==========================================
// TIERS
// ==========================================

// ==========================================
// MESSAGES
// ==========================================

export const listContactMessages = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("contactMessages")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const markContactMessageRead = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { isRead: args.isRead });
  },
});

export const deleteContactMessage = mutation({
  args: {
    secret: v.string(),
    id: v.id("contactMessages"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TICKETS
// ==========================================

export const listSupportTickets = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("supportTickets")
      .withIndex("by_created_at")
      .order("desc")
      .take(500);
  },
});

export const updateSupportTicketStatus = mutation({
  args: {
    secret: v.string(),
    id: v.id("supportTickets"),
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// ==========================================
// USERS
// ==========================================

export const listUsers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const users = await ctx.db.query("users").order("desc").take(500);

    const results = await Promise.all(
      users.map(async (user) => {
        const memberships = await ctx.db
          .query("organizationMembers")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();
        return { ...user, organizationCount: memberships.length };
      })
    );

    return results;
  },
});

export const banUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    banReason: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: true,
      bannedAt: Date.now(),
      bannedBy: "admin",
      banReason: args.banReason,
    });

    // Revoke all active CLI tokens for this user
    const cliTokens = await ctx.db
      .query("cliTokens")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .collect();

    for (const token of cliTokens) {
      await ctx.db.patch(token._id, {
        isActive: false,
        revokedAt: Date.now(),
      });
    }

    // Revoke all active extension sessions (projectAccess) for this user
    const extensionSessions = await ctx.db
      .query("projectAccess")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    for (const session of extensionSessions) {
      if (session.isActive) {
        await ctx.db.patch(session._id, { isActive: false });
      }
    }
  },
});

export const unbanUser = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    await ctx.db.patch(args.userId, {
      isBanned: false,
      bannedAt: undefined,
      bannedBy: undefined,
      banReason: undefined,
    });
  },
});

// ==========================================
// ORGANIZATIONS
// ==========================================

export const listOrganizations = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const organizations = await ctx.db
      .query("organizations")
      .order("desc")
      .take(500);

    const results = [];
    for (const org of organizations) {
      const members = await ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      const projects = await ctx.db
        .query("projects")
        .withIndex("by_organization", (q) => q.eq("organizationId", org._id))
        .collect();

      // Resolve tier from org owner's userTiers record
      const ownerTier = await ctx.db
        .query("userTiers")
        .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
        .first();

      results.push({
        ...org,
        memberCount: members.length,
        projectCount: projects.length,
        tier: ownerTier?.tier ?? "free",
      });
    }

    return results;
  },
});

export const getOrganizationDetail = query({
  args: {
    secret: v.string(),
    organizationId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const members = [];
    for (const membership of memberships) {
      const user = await ctx.db.get(membership.userId);
      members.push({
        ...membership,
        user: user
          ? {
              _id: user._id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
              isBanned: user.isBanned,
            }
          : null,
      });
    }

    const projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    // Resolve tier from org owner's userTiers record
    const ownerTier = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
      .first();

    return {
      ...org,
      members,
      projects,
      tier: ownerTier?.tier ?? "free",
    };
  },
});

// ==========================================
// CHANGELOG
// ==========================================

export const listAllChangelog = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db.query("changelog").order("desc").collect();
  },
});

export const createChangelog = mutation({
  args: {
    secret: v.string(),
    title: v.string(),
    content: v.string(),
    version: v.string(),
    type: v.union(
      v.literal("feature"),
      v.literal("fix"),
      v.literal("improvement"),
      v.literal("security"),
      v.literal("breaking")
    ),
    types: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("fix"),
          v.literal("improvement"),
          v.literal("security"),
          v.literal("breaking")
        )
      )
    ),
    isPublished: v.optional(v.boolean()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const now = Date.now();
    const typesArray = args.types ?? [args.type];
    const isPublished = args.isPublished ?? false;

    // Derive publish status
    let publishStatus: string;
    let publishedAt: number | undefined;

    if (args.scheduledFor && args.scheduledFor > now) {
      publishStatus = "scheduled";
      publishedAt = args.scheduledFor;
    } else if (isPublished) {
      publishStatus = "published";
      publishedAt = now;
    } else {
      publishStatus = "draft";
      publishedAt = undefined;
    }

    return await ctx.db.insert("changelog", {
      title: args.title,
      content: args.content,
      version: args.version,
      type: typesArray[0],
      types: typesArray,
      isPublished: publishStatus === "published",
      publishedAt,
      scheduledFor: args.scheduledFor,
      publishStatus,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateChangelog = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
    title: v.optional(v.string()),
    content: v.optional(v.string()),
    version: v.optional(v.string()),
    type: v.optional(
      v.union(
        v.literal("feature"),
        v.literal("fix"),
        v.literal("improvement"),
        v.literal("security"),
        v.literal("breaking")
      )
    ),
    types: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("fix"),
          v.literal("improvement"),
          v.literal("security"),
          v.literal("breaking")
        )
      )
    ),
    scheduledFor: v.optional(v.number()),
    isPublished: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const now = Date.now();
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Changelog entry not found");

    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.title !== undefined) updates.title = args.title;
    if (args.content !== undefined) updates.content = args.content;
    if (args.version !== undefined) updates.version = args.version;

    // Handle types
    if (args.types !== undefined) {
      updates.types = args.types;
      updates.type = args.types[0]; // backward compat
    } else if (args.type !== undefined) {
      updates.type = args.type;
    }

    // Handle scheduling / publish status
    if (args.scheduledFor !== undefined || args.isPublished !== undefined) {
      const scheduledFor = args.scheduledFor ?? entry.scheduledFor;
      const isPublished = args.isPublished ?? entry.isPublished;

      if (scheduledFor && scheduledFor > now) {
        updates.publishStatus = "scheduled";
        updates.isPublished = false;
        updates.publishedAt = scheduledFor;
        updates.scheduledFor = scheduledFor;
      } else if (isPublished) {
        updates.publishStatus = "published";
        updates.isPublished = true;
        updates.publishedAt = entry.publishedAt ?? now;
        updates.scheduledFor = undefined;
      } else {
        updates.publishStatus = "draft";
        updates.isPublished = false;
        updates.scheduledFor = undefined;
      }
    }

    await ctx.db.patch(args.id, updates);
  },
});

export const toggleChangelogPublish = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const entry = await ctx.db.get(args.id);
    if (!entry) {
      throw new Error("Changelog entry not found");
    }

    const now = Date.now();
    const newPublished = !entry.isPublished;
    await ctx.db.patch(args.id, {
      isPublished: newPublished,
      publishedAt: newPublished ? now : entry.publishedAt,
      publishStatus: newPublished ? "published" : "draft",
      scheduledFor: undefined, // Clear schedule on manual toggle
      updatedAt: now,
    });
  },
});

export const deleteChangelog = mutation({
  args: {
    secret: v.string(),
    id: v.id("changelog"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.delete(args.id);
  },
});

// ==========================================
// TIER DEFINITIONS (Dynamic tier management)
// ==========================================

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
        ctaLink: "/api/checkout?products=d1edde6d-3201-4cec-b1e4-e053d7edba23",
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

// ==========================================
// FEATURE REQUESTS
// ==========================================

export const listFeatureRequests = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    return await ctx.db
      .query("featureRequests")
      .withIndex("by_vote_count")
      .order("desc")
      .collect();
  },
});

export const updateFeatureRequestStatus = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const updateFeatureRequestAdminNotes = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
    adminNotes: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    await ctx.db.patch(args.id, { adminNotes: args.adminNotes });
  },
});

export const createFeatureRequest = mutation({
  args: {
    secret: v.string(),
    title: v.string(),
    description: v.string(),
    category: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("under_review"),
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("declined")
      )
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const title = args.title.trim();
    const description = args.description.trim();
    if (!title) throw new Error("Title is required");
    if (!description) throw new Error("Description is required");
    if (title.length > 200) throw new Error("Title too long (max 200)");
    if (description.length > 5000)
      throw new Error("Description too long (max 5000)");

    const now = Date.now();
    return await ctx.db.insert("featureRequests", {
      title,
      description,
      submitterName: "Envpilot Team",
      status: args.status ?? "planned",
      category: args.category?.trim() || undefined,
      adminNotes: args.adminNotes?.trim() || undefined,
      voteCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const deleteFeatureRequest = mutation({
  args: {
    secret: v.string(),
    id: v.id("featureRequests"),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Delete all associated votes first
    const votes = await ctx.db
      .query("featureVotes")
      .withIndex("by_feature_request", (q) => q.eq("featureRequestId", args.id))
      .collect();

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete the feature request
    await ctx.db.delete(args.id);
  },
});

export const clearAllFeatureRequests = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const allRequests = await ctx.db.query("featureRequests").collect();
    const allVotes = await ctx.db.query("featureVotes").collect();

    for (const vote of allVotes) {
      await ctx.db.delete(vote._id);
    }
    for (const req of allRequests) {
      await ctx.db.delete(req._id);
    }

    return {
      deletedRequests: allRequests.length,
      deletedVotes: allVotes.length,
    };
  },
});

// ==========================================
// MIGRATIONS
// ==========================================

export const listMigrations = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => {
    verifyAdmin(args.secret);
    return [
      // ── Feature & Tier System (run when adding features or updating tiers) ──
      {
        name: "seed-feature-registry",
        description:
          "Seeds all gatable features into the featureRegistry table. Idempotent — skips existing keys.",
        category: "Feature & Tier System",
        priority: 1,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-tier-features",
        description:
          "Seeds default tier-feature overrides for free and pro tiers. Idempotent — skips existing overrides.",
        category: "Feature & Tier System",
        priority: 2,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-tier-definitions",
        description:
          "Seeds or updates default 'free' and 'pro' tier definitions (upsert). Safe to run multiple times — updates existing tiers with latest pricing and display fields.",
        category: "Feature & Tier System",
        priority: 3,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-payment-products",
        description:
          "Seeds payment product mappings from tierDefinitions.polarProductId into the paymentProducts table. Idempotent — skips existing mappings.",
        category: "Feature & Tier System",
        priority: 4,
        destructive: false,
        runOnce: false,
      },

      // ── Content Seeding ──
      {
        name: "seed-changelog",
        description:
          "Seeds all historical changelog entries (v0.1.0 through v1.7.1). Idempotent — skips entries that already exist, removes duplicates. Safe to run multiple times.",
        category: "Content Seeding",
        priority: 1,
        destructive: false,
        runOnce: false,
      },
      {
        name: "seed-feature-requests",
        description:
          "Seeds planned team features into the featureRequests table from FEATURES.md reference. Idempotent — skips entries that already exist by title. Safe to run multiple times.",
        category: "Content Seeding",
        priority: 2,
        destructive: false,
        runOnce: false,
      },

      // ── Destructive / Reset ──
      {
        name: "clear-changelog",
        description:
          "Deletes ALL changelog entries from the database. Use before re-seeding or to start fresh.",
        category: "Destructive",
        priority: 1,
        destructive: true,
        runOnce: false,
      },
      {
        name: "clear-feature-requests",
        description:
          "Deletes ALL feature requests and their votes from the database.",
        category: "Destructive",
        priority: 2,
        destructive: true,
        runOnce: false,
      },

      // ── One-Time Migrations ──
      {
        name: "migrate-phase6",
        description:
          "Phase 6 migration: strips legacy limits/features from tierDefinitions, migrates organizationTiers to userTiers, backfills userId on subscriptions. Run ONCE after deploying Phase 6 schema.",
        category: "One-Time Migrations",
        priority: 1,
        destructive: false,
        runOnce: true,
      },
    ] as Array<{
      name: string;
      description: string;
      category: string;
      priority: number;
      destructive: boolean;
      runOnce: boolean;
    }>;
  },
});

export const runMigration = mutation({
  args: {
    secret: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (args.name === "seed-tier-definitions") {
      const existing = await ctx.db.query("tierDefinitions").collect();
      const existingByName = new Map(existing.map((t) => [t.name, t]));
      const now = Date.now();

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
          badge: "Alpha · Free during early access",
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
          ctaLink:
            "/api/checkout?products=d1edde6d-3201-4cec-b1e4-e053d7edba23",
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

      let created = 0;
      let updated = 0;
      for (const tier of seedData) {
        const found = existingByName.get(tier.name);
        if (found) {
          await ctx.db.patch(found._id, { ...tier, updatedAt: now });
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

      return {
        success: true,
        total: seedData.length,
        migrated: created,
        updated,
        skipped: 0,
      };
    }

    if (args.name === "seed-feature-registry") {
      const SEED_FEATURES = [
        {
          key: "max_projects",
          displayName: "Max Projects",
          valueType: "numeric" as const,
          category: "Resources",
          defaultValue: "3",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "max_variables_per_project",
          displayName: "Max Variables per Project",
          valueType: "numeric" as const,
          category: "Resources",
          defaultValue: "50",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "max_organizations",
          displayName: "Max Organizations",
          valueType: "numeric" as const,
          category: "Resources",
          defaultValue: "1",
          resettable: false,
          sortOrder: 2,
        },
        {
          key: "max_team_members",
          displayName: "Max Team Members",
          valueType: "numeric" as const,
          category: "Team",
          defaultValue: "3",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "max_invitations",
          displayName: "Max Pending Invitations",
          valueType: "numeric" as const,
          category: "Team",
          defaultValue: "5",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "variable_version_history",
          displayName: "Variable Version History",
          valueType: "boolean" as const,
          category: "Variables",
          defaultValue: "false",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "bulk_import",
          displayName: "Bulk Import",
          valueType: "boolean" as const,
          category: "Variables",
          defaultValue: "false",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "bulk_delete",
          displayName: "Bulk Delete",
          valueType: "boolean" as const,
          category: "Variables",
          defaultValue: "true",
          resettable: false,
          sortOrder: 2,
        },
        {
          key: "bulk_export",
          displayName: "Bulk Export",
          valueType: "boolean" as const,
          category: "Variables",
          defaultValue: "false",
          resettable: false,
          sortOrder: 3,
        },
        {
          key: "variable_tags",
          displayName: "Variable Tags",
          valueType: "boolean" as const,
          category: "Variables",
          defaultValue: "true",
          resettable: false,
          sortOrder: 4,
        },
        {
          key: "api_access",
          displayName: "API Access",
          valueType: "boolean" as const,
          category: "Tools",
          defaultValue: "true",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "extension_access",
          displayName: "VS Code Extension",
          valueType: "boolean" as const,
          category: "Tools",
          defaultValue: "false",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "cli_access",
          displayName: "CLI Access",
          valueType: "boolean" as const,
          category: "Tools",
          defaultValue: "false",
          resettable: false,
          sortOrder: 2,
        },
        {
          key: "access_tokens",
          displayName: "CI/CD Access Tokens",
          valueType: "boolean" as const,
          category: "Tools",
          defaultValue: "false",
          resettable: false,
          sortOrder: 3,
        },
        {
          key: "granular_permissions",
          displayName: "Granular Permissions",
          valueType: "boolean" as const,
          category: "Security",
          defaultValue: "true",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "audit_log_retention_days",
          displayName: "Audit Log Retention (days)",
          valueType: "numeric" as const,
          category: "Security",
          defaultValue: "7",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "sso_enabled",
          displayName: "SSO",
          valueType: "boolean" as const,
          category: "Security",
          defaultValue: "false",
          resettable: false,
          sortOrder: 2,
        },
        {
          key: "secret_rotation",
          displayName: "Secret Rotation & Expiry",
          valueType: "boolean" as const,
          category: "Security",
          defaultValue: "false",
          resettable: false,
          sortOrder: 3,
        },
        {
          key: "secret_rotation_limit",
          displayName: "Max Rotation-Enabled Variables",
          valueType: "numeric" as const,
          category: "Security",
          defaultValue: "0",
          resettable: false,
          sortOrder: 4,
        },
        {
          key: "secret_sharing",
          displayName: "Secret Sharing Links",
          valueType: "boolean" as const,
          category: "Security",
          defaultValue: "false",
          resettable: false,
          sortOrder: 5,
        },
        {
          key: "max_active_shares",
          displayName: "Max Active Shares",
          valueType: "numeric" as const,
          category: "Security",
          defaultValue: "0",
          resettable: false,
          sortOrder: 6,
        },
        {
          key: "keyboard_shortcuts_custom",
          displayName: "Custom Keyboard Shortcuts",
          valueType: "boolean" as const,
          category: "Customization",
          defaultValue: "true",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "custom_branding",
          displayName: "Custom Branding",
          valueType: "boolean" as const,
          category: "Customization",
          defaultValue: "false",
          resettable: false,
          sortOrder: 1,
        },
        {
          key: "analytics_retention_days",
          displayName: "Analytics Retention (days)",
          valueType: "numeric" as const,
          category: "Analytics",
          defaultValue: "7",
          resettable: false,
          sortOrder: 0,
        },
        {
          key: "priority_support",
          displayName: "Priority Support",
          valueType: "boolean" as const,
          category: "Support",
          defaultValue: "false",
          resettable: false,
          sortOrder: 0,
        },
      ];

      let created = 0;
      let updated = 0;
      let skipped = 0;
      const now = Date.now();

      for (const f of SEED_FEATURES) {
        const existing = await ctx.db
          .query("featureRegistry")
          .withIndex("by_key", (q: any) => q.eq("key", f.key))
          .first();
        if (existing) {
          // Update if properties have drifted
          const needsUpdate =
            existing.displayName !== f.displayName ||
            existing.valueType !== f.valueType ||
            existing.category !== f.category ||
            existing.defaultValue !== f.defaultValue ||
            existing.resettable !== f.resettable ||
            existing.sortOrder !== f.sortOrder;

          if (needsUpdate) {
            await ctx.db.patch(existing._id, {
              displayName: f.displayName,
              valueType: f.valueType,
              category: f.category,
              defaultValue: f.defaultValue,
              resettable: f.resettable,
              sortOrder: f.sortOrder,
              updatedAt: now,
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }
        await ctx.db.insert("featureRegistry", {
          ...f,
          description: undefined,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return {
        success: true,
        total: SEED_FEATURES.length,
        migrated: created,
        updated,
        skipped,
      };
    }

    if (args.name === "seed-tier-features") {
      const tierConfigs: Record<string, Record<string, string>> = {
        free: {
          max_projects: "3",
          max_variables_per_project: "50",
          max_organizations: "1",
          max_team_members: "3",
          max_invitations: "5",
          variable_version_history: "false",
          bulk_import: "false",
          bulk_delete: "true",
          bulk_export: "false",
          variable_tags: "true",
          api_access: "true",
          extension_access: "false",
          cli_access: "false",
          access_tokens: "false",
          granular_permissions: "true",
          audit_log_retention_days: "7",
          sso_enabled: "false",
          secret_rotation: "false",
          secret_rotation_limit: "7",
          secret_sharing: "false",
          max_active_shares: "0",
          keyboard_shortcuts_custom: "true",
          custom_branding: "false",
          analytics_retention_days: "7",
          priority_support: "false",
        },
        pro: {
          max_projects: "null",
          max_variables_per_project: "null",
          max_organizations: "null",
          max_team_members: "null",
          max_invitations: "null",
          variable_version_history: "true",
          bulk_import: "true",
          bulk_delete: "true",
          bulk_export: "true",
          variable_tags: "true",
          api_access: "true",
          extension_access: "true",
          cli_access: "true",
          access_tokens: "true",
          granular_permissions: "true",
          audit_log_retention_days: "365",
          sso_enabled: "false",
          secret_rotation: "true",
          secret_rotation_limit: "null",
          secret_sharing: "true",
          max_active_shares: "null",
          keyboard_shortcuts_custom: "true",
          custom_branding: "true",
          analytics_retention_days: "30",
          priority_support: "true",
        },
      };

      let created = 0;
      let skipped = 0;

      for (const [tierName, features] of Object.entries(tierConfigs)) {
        for (const [featureKey, value] of Object.entries(features)) {
          const existing = await ctx.db
            .query("tierFeatures")
            .withIndex("by_tier_and_feature", (q: any) =>
              q.eq("tierName", tierName).eq("featureKey", featureKey)
            )
            .first();
          if (existing) {
            skipped++;
            continue;
          }
          await ctx.db.insert("tierFeatures", {
            tierName,
            featureKey,
            value,
            updatedAt: Date.now(),
          });
          created++;
        }
      }

      return {
        success: true,
        total: Object.values(tierConfigs).reduce(
          (sum, f) => sum + Object.keys(f).length,
          0
        ),
        migrated: created,
        skipped,
      };
    }

    if (args.name === "migrate-phase6") {
      const results = {
        tierDefsCleanedLimits: 0,
        tierDefsCleanedFeatures: 0,
        orgTiersMigrated: 0,
        orgTiersDeleted: 0,
        subscriptionsBackfilled: 0,
        polarCustomersBackfilled: 0,
      };

      const now = Date.now();

      // 1. Strip limits/features from tierDefinitions
      const tierDefs = await ctx.db.query("tierDefinitions").collect();
      for (const td of tierDefs) {
        const updates: Record<string, undefined> = {};
        if ((td as Record<string, unknown>).limits !== undefined) {
          updates.limits = undefined;
          results.tierDefsCleanedLimits++;
        }
        if ((td as Record<string, unknown>).features !== undefined) {
          updates.features = undefined;
          results.tierDefsCleanedFeatures++;
        }
        if ((td as Record<string, unknown>).dynamicFeatures !== undefined) {
          updates.dynamicFeatures = undefined;
          results.tierDefsCleanedLimits++;
        }
        if (Object.keys(updates).length > 0) {
          await ctx.db.patch(td._id, updates);
        }
      }

      // 2. Migrate organizationTiers -> userTiers
      const orgTiers = await ctx.db.query("organizationTiers").collect();
      for (const ot of orgTiers) {
        const org = await ctx.db.get(ot.organizationId);
        if (org) {
          const existing = await ctx.db
            .query("userTiers")
            .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
            .first();
          if (!existing) {
            await ctx.db.insert("userTiers", {
              userId: org.createdBy,
              tier: ot.tier,
              updatedAt: now,
              reason: "migration.phase6",
            });
            results.orgTiersMigrated++;
          }
        }
      }

      // 3. Delete all organizationTiers records
      for (const ot of orgTiers) {
        await ctx.db.delete(ot._id);
        results.orgTiersDeleted++;
      }

      // 4. Backfill userId on subscriptions
      const subs = await ctx.db.query("subscriptions").collect();
      for (const sub of subs) {
        if (!sub.userId) {
          const org = await ctx.db.get(sub.organizationId);
          if (org) {
            await ctx.db.patch(sub._id, { userId: org.createdBy });
            results.subscriptionsBackfilled++;
          }
        }
      }

      // 5. Backfill userId on polarCustomers
      const customers = await ctx.db.query("polarCustomers").collect();
      for (const sc of customers) {
        if (!sc.userId) {
          const org = await ctx.db.get(sc.organizationId);
          if (org) {
            await ctx.db.patch(sc._id, { userId: org.createdBy });
            results.polarCustomersBackfilled++;
          }
        }
      }

      return { success: true, ...results };
    }

    if (args.name === "seed-changelog") {
      let created = 0;
      let skipped = 0;
      let deduped = 0;
      const now = Date.now();

      for (const entry of SEED_CHANGELOG) {
        const existing = await ctx.db
          .query("changelog")
          .withIndex("by_version", (q: any) => q.eq("version", entry.version))
          .collect();

        const matches = existing.filter(
          (e: { title: string }) => e.title === entry.title
        );

        if (matches.length > 0) {
          // Keep first, delete any duplicates
          for (let i = 1; i < matches.length; i++) {
            await ctx.db.delete(matches[i]._id);
            deduped++;
          }
          skipped++;
          continue;
        }

        await ctx.db.insert("changelog", {
          title: entry.title,
          content: entry.content,
          version: entry.version,
          type: entry.type,
          isPublished: true,
          publishedAt: entry.publishedAt,
          createdAt: entry.publishedAt,
          updatedAt: now,
        });
        created++;
      }

      return {
        success: true,
        total: SEED_CHANGELOG.length,
        migrated: created,
        skipped,
        duplicatesRemoved: deduped,
      };
    }

    if (args.name === "clear-changelog") {
      const all = await ctx.db.query("changelog").collect();
      for (const entry of all) {
        await ctx.db.delete(entry._id);
      }
      return { success: true, deleted: all.length };
    }

    if (args.name === "seed-feature-requests") {
      let created = 0;
      let skipped = 0;
      const now = Date.now();

      for (const entry of SEED_FEATURE_REQUESTS) {
        // Check if a feature request with this exact title already exists
        const existing = await ctx.db.query("featureRequests").collect();
        const match = existing.find(
          (e: { title: string }) => e.title === entry.title
        );

        if (match) {
          skipped++;
          continue;
        }

        await ctx.db.insert("featureRequests", {
          title: entry.title,
          description: entry.description,
          submitterName: "Envpilot Team",
          status: entry.status,
          category: entry.category,
          adminNotes: entry.adminNotes,
          voteCount: 0,
          createdAt: now,
          updatedAt: now,
        });
        created++;
      }

      return {
        success: true,
        total: SEED_FEATURE_REQUESTS.length,
        created,
        skipped,
      };
    }

    if (args.name === "clear-feature-requests") {
      const allRequests = await ctx.db.query("featureRequests").collect();
      const allVotes = await ctx.db.query("featureVotes").collect();

      for (const vote of allVotes) {
        await ctx.db.delete(vote._id);
      }
      for (const req of allRequests) {
        await ctx.db.delete(req._id);
      }

      return {
        success: true,
        deletedRequests: allRequests.length,
        deletedVotes: allVotes.length,
      };
    }

    if (args.name === "seed-payment-products") {
      const tiers = await ctx.db.query("tierDefinitions").collect();
      const existingProducts = await ctx.db.query("paymentProducts").collect();
      const now = Date.now();
      let created = 0;
      let skipped = 0;

      for (const tier of tiers) {
        if (!tier.polarProductId) continue;
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

      return { success: true, created, skipped };
    }

    throw new Error(`Unknown migration: ${args.name}`);
  },
});

// ==========================================
// DATA BROWSER
// ==========================================

export const browseTable = query({
  args: {
    secret: v.string(),
    tableName: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const rows = await (ctx.db.query(args.tableName as any) as any)
      .order("desc")
      .take(100);

    return rows;
  },
});

export const updateTableRow = mutation({
  args: {
    secret: v.string(),
    tableName: v.string(),
    id: v.string(),
    fields: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const parsedFields = JSON.parse(args.fields);
    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.patch(args.id as any, parsedFields);
  },
});

export const deleteTableRow = mutation({
  args: {
    secret: v.string(),
    tableName: v.string(),
    id: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }

    const doc = await ctx.db.get(args.id as any);
    if (!doc) {
      throw new Error("Document not found");
    }

    await ctx.db.delete(args.id as any);
  },
});

export const browseTablePaginated = query({
  args: {
    secret: v.string(),
    tableName: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    if (
      !BROWSABLE_TABLES.includes(
        args.tableName as (typeof BROWSABLE_TABLES)[number]
      )
    ) {
      throw new Error(`Table "${args.tableName}" is not browsable`);
    }
    return await (ctx.db.query(args.tableName as any) as any)
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// ==========================================
// ADMIN SETTINGS
// ==========================================

export const getAdminSettings = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const settings = await ctx.db.query("adminSettings").collect();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    return result;
  },
});

export const updateAdminSetting = mutation({
  args: {
    secret: v.string(),
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    const previousValue = existing?.value ?? null;

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.key,
        value: args.value,
        updatedAt: Date.now(),
      });
    }

    // Audit log for sensitive setting changes
    if (args.key === "tierEnforcement" || args.key === "paymentsEnabled") {
      console.warn(
        `[SECURITY AUDIT] Admin setting toggled: key=${args.key}, value=${args.value}, previousValue=${previousValue}, timestamp=${new Date().toISOString()}`
      );
    }
  },
});

// ==========================================
// PAYMENT READINESS (Production deployment checklist)
// ==========================================

export const getPaymentReadiness = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const paymentProducts = await ctx.db.query("paymentProducts").collect();
    const tierDefinitions = await ctx.db.query("tierDefinitions").collect();
    const subscriptions = await ctx.db.query("subscriptions").collect();

    // Check which paid tiers have active payment products
    const paidTiers = tierDefinitions.filter((t) => !t.isDefault);
    const tiersWithProducts = paidTiers.map((tier) => {
      const product = paymentProducts.find(
        (p) => p.tierName === tier.name && p.provider === "polar" && p.isActive
      );
      return {
        tierName: tier.name,
        displayName: tier.displayName,
        hasActiveProduct: !!product,
        productId: product?.productId ?? null,
      };
    });

    const activeSubscriptions = subscriptions.filter(
      (s) => s.status === "active"
    );

    // Read current paymentsEnabled setting
    const setting = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", "paymentsEnabled"))
      .first();

    return {
      paymentsEnabled: setting?.value === "true",
      paymentProductsSeeded: paymentProducts.length > 0,
      tiersWithProducts,
      allPaidTiersConfigured: tiersWithProducts.every(
        (t) => t.hasActiveProduct
      ),
      activeSubscriptionCount: activeSubscriptions.length,
      canEnable: tiersWithProducts.some((t) => t.hasActiveProduct),
    };
  },
});

// ==========================================
// ENHANCED ANALYTICS
// ==========================================

export const getAnalytics = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Get all users with creation times for growth chart
    const users = await ctx.db.query("users").take(10000);
    const organizations = await ctx.db.query("organizations").take(10000);
    const projects = await ctx.db.query("projects").take(10000);

    // Messages and tickets
    const contactMessages = await ctx.db.query("contactMessages").collect();
    const supportTickets = await ctx.db.query("supportTickets").collect();

    // Feature requests
    const featureRequests = await ctx.db.query("featureRequests").collect();

    // Build monthly growth data for last 12 months
    const now = Date.now();
    const months: Array<{ label: string; timestamp: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setMonth(d.getMonth() - i);
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      months.push({
        label: d.toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        timestamp: d.getTime(),
      });
    }

    // End boundary: start of next month
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(1);
    endDate.setHours(0, 0, 0, 0);
    const endTimestamp = endDate.getTime();

    function countByMonth(
      items: Array<{ createdAt?: number; _creationTime: number }>
    ) {
      return months.map((month, i) => {
        const start = month.timestamp;
        const end =
          i < months.length - 1 ? months[i + 1].timestamp : endTimestamp;
        return items.filter((item) => {
          const t = item.createdAt ?? item._creationTime;
          return t >= start && t < end;
        }).length;
      });
    }

    function cumulativeByMonth(
      items: Array<{ createdAt?: number; _creationTime: number }>
    ) {
      const monthly = countByMonth(items);
      const cumulative: number[] = [];
      // Count items before the first month
      let total = items.filter((item) => {
        const t = item.createdAt ?? item._creationTime;
        return t < months[0].timestamp;
      }).length;
      for (const count of monthly) {
        total += count;
        cumulative.push(total);
      }
      return cumulative;
    }

    // Ticket status distribution
    const ticketStatusCounts: Record<string, number> = {};
    for (const t of supportTickets) {
      ticketStatusCounts[t.status] = (ticketStatusCounts[t.status] || 0) + 1;
    }

    // Feature request status distribution
    const featureStatusCounts: Record<string, number> = {};
    for (const fr of featureRequests) {
      featureStatusCounts[fr.status] =
        (featureStatusCounts[fr.status] || 0) + 1;
    }

    // Ticket category distribution
    const ticketCategoryCounts: Record<string, number> = {};
    for (const t of supportTickets) {
      ticketCategoryCounts[t.category] =
        (ticketCategoryCounts[t.category] || 0) + 1;
    }

    // Tier distribution — user-level
    const userTiers = await ctx.db.query("userTiers").take(5000);
    const tierDistribution: Record<string, number> = {};
    for (const ut of userTiers) {
      tierDistribution[ut.tier] = (tierDistribution[ut.tier] || 0) + 1;
    }

    // Messages read/unread
    const messagesRead = contactMessages.filter((m) => m.isRead).length;
    const messagesUnread = contactMessages.filter((m) => !m.isRead).length;

    // Top feature requests by votes
    const topFeatureRequests = [...featureRequests]
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, 10)
      .map((fr) => ({
        title: fr.title,
        votes: fr.voteCount,
        status: fr.status,
      }));

    // Recent activity: last 30 days counts
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentUsers = users.filter(
      (u) => (u.createdAt ?? u._creationTime) >= thirtyDaysAgo
    ).length;
    const recentOrgs = organizations.filter(
      (o) => o.createdAt >= thirtyDaysAgo
    ).length;
    const recentProjects = projects.filter(
      (p) => p.createdAt >= thirtyDaysAgo
    ).length;
    const recentTickets = supportTickets.filter(
      (t) => t.createdAt >= thirtyDaysAgo
    ).length;

    return {
      monthLabels: months.map((m) => m.label),
      userGrowth: cumulativeByMonth(users),
      orgGrowth: cumulativeByMonth(organizations),
      projectGrowth: cumulativeByMonth(projects),
      newUsersPerMonth: countByMonth(users),
      newOrgsPerMonth: countByMonth(organizations),
      ticketsPerMonth: countByMonth(supportTickets),
      messagesPerMonth: countByMonth(contactMessages),
      tierDistribution,
      ticketStatusCounts,
      ticketCategoryCounts,
      featureStatusCounts,
      messagesRead,
      messagesUnread,
      topFeatureRequests,
      recent30d: {
        users: recentUsers,
        organizations: recentOrgs,
        projects: recentProjects,
        tickets: recentTickets,
      },
    };
  },
});

// ==========================================
// FEATURE REGISTRY (read-only for admin)
// ==========================================

/** List all registered features (developer-seeded, admin can only toggle active) */
export const listFeatureRegistry = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const features = await ctx.db.query("featureRegistry").collect();
    return features.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

/** Toggle a feature active/inactive */
export const toggleFeatureActive = mutation({
  args: {
    secret: v.string(),
    featureId: v.id("featureRegistry"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
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
  args: { secret: v.string(), tierName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
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
    secret: v.string(),
    tierName: v.string(),
    featureKey: v.string(),
    value: v.string(), // "true", "false", "50", "null"
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
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
    secret: v.string(),
    tierName: v.string(),
    featureKey: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

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

// ==========================================
// USER TIER MANAGEMENT (replaces org tier assignments)
// ==========================================

/** List all user tiers with user info and owned org count */
export const listUserTiers = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const userTierRecords = await ctx.db.query("userTiers").take(200);

    return await Promise.all(
      userTierRecords.map(async (ut) => {
        const user = await ctx.db.get(ut.userId);
        const ownedOrgs = await ctx.db
          .query("organizationMembers")
          .withIndex("by_user", (q) => q.eq("userId", ut.userId))
          .filter((q) => q.eq(q.field("role"), "admin"))
          .collect();

        // Check grace period
        const grace = await ctx.db
          .query("subscriptionGracePeriods")
          .withIndex("by_user", (q) => q.eq("userId", ut.userId))
          .first();
        const graceActive =
          grace?.isActive === true && grace.gracePeriodEnd > Date.now();

        return {
          ...ut,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email ?? "Unknown",
          ownedOrgCount: ownedOrgs.length,
          graceActive,
          gracePeriodEnd: graceActive ? grace!.gracePeriodEnd : undefined,
        };
      })
    );
  },
});

/** Assign tier to a user */
export const updateUserTier = mutation({
  args: {
    secret: v.string(),
    userId: v.id("users"),
    tier: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const now = Date.now();

    // Validate tier exists
    const tierDef = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", args.tier))
      .first();
    if (!tierDef) {
      throw new Error(`Tier "${args.tier}" not found`);
    }

    // Upsert userTiers
    const existing = await ctx.db
      .query("userTiers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: args.tier,
        updatedAt: now,
        reason: args.reason ?? "admin.manual_assignment",
      });
    } else {
      await ctx.db.insert("userTiers", {
        userId: args.userId,
        tier: args.tier,
        updatedAt: now,
        reason: args.reason ?? "admin.manual_assignment",
      });
    }
  },
});

// ==========================================
// PHASE 6 MIGRATION
// ==========================================

/**
 * Migration: Clean up legacy data from the Phase 6 schema transition.
 *
 * 1. Strips `limits` and `features` from all tierDefinitions documents.
 * 2. Migrates organizationTiers → userTiers (if not already migrated).
 * 3. Deletes all organizationTiers records.
 * 4. Backfills userId on subscriptions/polarCustomers from org owner.
 *
 * Run this ONCE after deploying the Phase 6 schema.
 * After running, redeploy with organizationTiers table + limits/features
 * fields fully removed from schema.ts.
 */
export const migratePhase6 = mutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);
    const now = Date.now();
    const results = {
      tierDefsCleanedLimits: 0,
      tierDefsCleanedFeatures: 0,
      orgTiersMigrated: 0,
      orgTiersDeleted: 0,
      subscriptionsBackfilled: 0,
      polarCustomersBackfilled: 0,
    };

    // 1. Strip limits/features from tierDefinitions
    const tierDefs = await ctx.db.query("tierDefinitions").collect();
    for (const td of tierDefs) {
      const updates: Record<string, undefined> = {};
      if ((td as Record<string, unknown>).limits !== undefined) {
        updates.limits = undefined;
        results.tierDefsCleanedLimits++;
      }
      if ((td as Record<string, unknown>).features !== undefined) {
        updates.features = undefined;
        results.tierDefsCleanedFeatures++;
      }
      if ((td as Record<string, unknown>).dynamicFeatures !== undefined) {
        updates.dynamicFeatures = undefined;
        results.tierDefsCleanedLimits++;
      }
      if (Object.keys(updates).length > 0) {
        await ctx.db.patch(td._id, updates);
      }
    }

    // 2. Migrate organizationTiers → userTiers
    const orgTiers = await ctx.db.query("organizationTiers").collect();
    for (const ot of orgTiers) {
      const org = await ctx.db.get(ot.organizationId);
      if (org) {
        const existing = await ctx.db
          .query("userTiers")
          .withIndex("by_user", (q) => q.eq("userId", org.createdBy))
          .first();
        if (!existing) {
          await ctx.db.insert("userTiers", {
            userId: org.createdBy,
            tier: ot.tier,
            updatedAt: now,
            reason: "migration.phase6",
          });
          results.orgTiersMigrated++;
        }
      }
    }

    // 3. Delete all organizationTiers records
    for (const ot of orgTiers) {
      await ctx.db.delete(ot._id);
      results.orgTiersDeleted++;
    }

    // 4. Backfill userId on subscriptions
    const subs = await ctx.db.query("subscriptions").collect();
    for (const sub of subs) {
      if (!sub.userId) {
        const org = await ctx.db.get(sub.organizationId);
        if (org) {
          await ctx.db.patch(sub._id, { userId: org.createdBy });
          results.subscriptionsBackfilled++;
        }
      }
    }

    // 5. Backfill userId on polarCustomers
    const customers = await ctx.db.query("polarCustomers").collect();
    for (const sc of customers) {
      if (!sc.userId) {
        const org = await ctx.db.get(sc.organizationId);
        if (org) {
          await ctx.db.patch(sc._id, { userId: org.createdBy });
          results.polarCustomersBackfilled++;
        }
      }
    }

    return results;
  },
});

// ==========================================
// CRON MANAGEMENT
// ==========================================

/**
 * List all registered cron jobs with their pause status.
 * Crons are statically defined at deploy time — this returns
 * metadata + runtime pause state from adminSettings.
 */
export const listCronJobs = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Static cron registry — mirrors convex/crons.ts
    const cronRegistry = [
      {
        name: "cleanup expired CLI sessions",
        function: "cliSessions.cleanupExpiredSessions",
        interval: "Every 1 hour",
        settingKey: "cron_pause_cleanup_cli_sessions",
      },
      {
        name: "cleanup expired project access",
        function: "projectAccess.cleanupExpired",
        interval: "Every 1 hour",
        settingKey: "cron_pause_cleanup_project_access",
      },
      {
        name: "cleanup revocation events",
        function: "permissionRevocationEvents.cleanup",
        interval: "Every 1 hour",
        settingKey: "cron_pause_cleanup_revocation_events",
      },
      {
        name: "cleanup expired invitations",
        function: "invitations.cleanupExpired",
        interval: "Every 6 hours",
        settingKey: "cron_pause_cleanup_invitations",
      },
      {
        name: "cleanup expired permissions",
        function: "permissions.cleanupExpired",
        interval: "Daily at 3:00 AM UTC",
        settingKey: "cron_pause_cleanup_permissions",
      },
      {
        name: "expire grace periods",
        function: "subscriptions.expireGracePeriods",
        interval: "Every 1 hour",
        settingKey: "cron_pause_expire_grace_periods",
      },
      {
        name: "process secret rotation expiry",
        function: "variables.processRotationExpiry",
        interval: "Every 1 hour",
        settingKey: "cron_pause_rotation_expiry",
      },
    ];

    const settings = await ctx.db.query("adminSettings").collect();
    const settingsMap = new Map(settings.map((s) => [s.key, s.value]));

    return cronRegistry.map((cron) => ({
      ...cron,
      paused: settingsMap.get(cron.settingKey) === "true",
    }));
  },
});

/**
 * Toggle pause state for a cron job.
 * The cron still fires on schedule but the handler skips all work when paused.
 */
export const toggleCronPause = mutation({
  args: {
    secret: v.string(),
    settingKey: v.string(),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Validate it's a known cron setting key
    if (!args.settingKey.startsWith("cron_pause_")) {
      throw new Error("Invalid cron setting key");
    }

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.settingKey))
      .first();

    const currentlyPaused = existing?.value === "true";
    const newValue = currentlyPaused ? "false" : "true";

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: newValue,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.settingKey,
        value: newValue,
        updatedAt: Date.now(),
      });
    }

    return { paused: !currentlyPaused };
  },
});

// ==========================================
// VARIABLE ROTATION ADMIN TOOLS
// ==========================================

/**
 * Update expiry time on a variable — for testing rotation workflows.
 */
export const updateVariableExpiry = mutation({
  args: {
    secret: v.string(),
    variableId: v.id("environmentVariables"),
    expiresAt: v.number(),
    rotationStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expiring_soon"),
        v.literal("expired")
      )
    ),
  },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    const variable = await ctx.db.get(args.variableId);
    if (!variable) throw new Error("Variable not found");
    if (!variable.rotationFrequencyDays) {
      throw new Error("Variable does not have rotation enabled");
    }

    await ctx.db.patch(args.variableId, {
      expiresAt: args.expiresAt,
      rotationStatus: args.rotationStatus ?? variable.rotationStatus,
      lastReminderSentAt: undefined, // Reset so reminders fire again
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * List all rotation-enabled variables across the system (admin view).
 */
export const listRotationVariables = query({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    verifyAdmin(args.secret);

    // Fetch all non-deleted variables and filter in JS —
    // Convex filters on optional fields can be unreliable with undefined checks
    const allVariables = await ctx.db
      .query("environmentVariables")
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    const variables = allVariables.filter(
      (v) =>
        v.rotationFrequencyDays !== undefined && v.rotationFrequencyDays > 0
    );

    const results = [];
    for (const variable of variables) {
      const project = await ctx.db.get(variable.projectId);
      results.push({
        _id: variable._id,
        key: variable.key,
        projectName: project?.name ?? "Unknown",
        rotationFrequencyDays: variable.rotationFrequencyDays!,
        expiresAt: variable.expiresAt!,
        rotationStatus: variable.rotationStatus ?? "active",
        lastReminderSentAt: variable.lastReminderSentAt,
      });
    }

    return results.sort((a, b) => a.expiresAt - b.expiresAt);
  },
});
