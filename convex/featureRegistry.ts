import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { isEnforcementEnabledFromDb, getDefaultTierName } from "./tierLimits";

/**
 * Dynamic Feature Registry
 *
 * Universal resolver for tier-based feature gating. Features are
 * developer-seeded (via seedFeatureRegistry), configured per-tier
 * by admins (via tierFeatures table), and enforced via a single
 * resolver chain:
 *
 *   org → org.createdBy (owner) → userTiers → tierFeatures → featureRegistry.defaultValue
 *
 * Adding a new gatable feature:
 *   1. Add an entry to SEED_FEATURES below
 *   2. Call checkBooleanFeature/checkNumericLimit at the enforcement point
 *   3. Done. No schema migration needed.
 */

// ==========================================
// VALUE PARSING
// ==========================================

/**
 * Parse a JSON string value into its typed form.
 */
function parseFeatureValue(
  raw: string,
  valueType: "boolean" | "numeric"
): boolean | number | null {
  if (valueType === "boolean") {
    return raw === "true";
  }
  // numeric
  if (raw === "null") return null; // unlimited
  const num = Number(raw);
  if (isNaN(num)) {
    throw new Error(`Invalid numeric feature value: "${raw}"`);
  }
  return num;
}

// ==========================================
// USER TIER RESOLUTION
// ==========================================

/**
 * Get a user's tier from the userTiers table.
 * Falls back to default tier if no record exists.
 */
export async function getUserTier(
  db: DatabaseReader,
  userId: Id<"users">
): Promise<string> {
  const tierRecord = await db
    .query("userTiers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  if (tierRecord) {
    return tierRecord.tier;
  }
  return await getDefaultTierName(db);
}

/**
 * Get the org owner's tier. This is the resolver entry point for org-scoped checks.
 * Chain: org → org.createdBy → userTiers → tier name
 */
export async function getOrgOwnerTier(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<{ tierName: string; ownerId: Id<"users"> }> {
  const org = await db.get(organizationId);
  if (!org) {
    throw new Error("Organization not found");
  }
  const ownerId = org.createdBy;
  const tierName = await getUserTier(db, ownerId);
  return { tierName, ownerId };
}

// ==========================================
// CORE RESOLVER
// ==========================================

/**
 * Resolve a feature's value for an organization.
 *
 * Chain: org → owner → userTiers → grace period check → tierFeatures → featureRegistry default
 */
export async function resolveFeatureValue(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string
): Promise<{
  value: boolean | number | null;
  tierName: string;
  valueType: "boolean" | "numeric";
}> {
  // 1. Check enforcement
  const enforced = await isEnforcementEnabledFromDb(db);
  if (!enforced) {
    // When enforcement is off, look up the feature type for a sensible unlimited value
    const feature = await db
      .query("featureRegistry")
      .withIndex("by_key", (q) => q.eq("key", featureKey))
      .first();
    const vt = feature?.valueType ?? "boolean";
    return {
      value: vt === "boolean" ? true : null,
      tierName: "unlimited",
      valueType: vt,
    };
  }

  // 2. Look up the feature definition
  const feature = await db
    .query("featureRegistry")
    .withIndex("by_key", (q) => q.eq("key", featureKey))
    .first();
  if (!feature || !feature.isActive) {
    // Unknown or inactive feature — deny by default (secure default)
    return { value: false, tierName: "unknown", valueType: "boolean" };
  }

  // 3. Get org owner's tier
  const { tierName, ownerId } = await getOrgOwnerTier(db, organizationId);

  // 4. Check grace period — if active, use the previous (higher) tier
  const grace = await db
    .query("subscriptionGracePeriods")
    .withIndex("by_user", (q) => q.eq("userId", ownerId))
    .first();

  let effectiveTier = tierName;
  if (grace?.isActive && grace.gracePeriodEnd > Date.now()) {
    effectiveTier = grace.previousTier;
  }

  // 5. Look up tier-specific override
  const override = await db
    .query("tierFeatures")
    .withIndex("by_tier_and_feature", (q) =>
      q.eq("tierName", effectiveTier).eq("featureKey", featureKey)
    )
    .first();

  // 6. Parse and return
  const rawValue = override?.value ?? feature.defaultValue;
  const parsed = parseFeatureValue(rawValue, feature.valueType);

  return {
    value: parsed,
    tierName: effectiveTier,
    valueType: feature.valueType,
  };
}

/**
 * Resolve a feature's value directly for a user (no org context).
 * Used for user-level limits like max_organizations.
 */
export async function resolveFeatureForUser(
  db: DatabaseReader,
  userId: Id<"users">,
  featureKey: string
): Promise<{
  value: boolean | number | null;
  tierName: string;
  valueType: "boolean" | "numeric";
}> {
  const enforced = await isEnforcementEnabledFromDb(db);
  if (!enforced) {
    const feature = await db
      .query("featureRegistry")
      .withIndex("by_key", (q) => q.eq("key", featureKey))
      .first();
    const vt = feature?.valueType ?? "boolean";
    return {
      value: vt === "boolean" ? true : null,
      tierName: "unlimited",
      valueType: vt,
    };
  }

  const feature = await db
    .query("featureRegistry")
    .withIndex("by_key", (q) => q.eq("key", featureKey))
    .first();
  if (!feature || !feature.isActive) {
    return { value: false, tierName: "unknown", valueType: "boolean" };
  }

  const tierName = await getUserTier(db, userId);

  // Check grace period
  const grace = await db
    .query("subscriptionGracePeriods")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  let effectiveTier = tierName;
  if (grace?.isActive && grace.gracePeriodEnd > Date.now()) {
    effectiveTier = grace.previousTier;
  }

  const override = await db
    .query("tierFeatures")
    .withIndex("by_tier_and_feature", (q) =>
      q.eq("tierName", effectiveTier).eq("featureKey", featureKey)
    )
    .first();

  const rawValue = override?.value ?? feature.defaultValue;
  const parsed = parseFeatureValue(rawValue, feature.valueType);

  return {
    value: parsed,
    tierName: effectiveTier,
    valueType: feature.valueType,
  };
}

// ==========================================
// CONVENIENCE FUNCTIONS (for use in mutations)
// ==========================================

/**
 * Check a boolean feature for an organization.
 * Returns { allowed, reason, tierName }.
 */
export async function checkBooleanFeature(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string
): Promise<{ allowed: boolean; reason?: string; tierName: string }> {
  const resolved = await resolveFeatureValue(db, organizationId, featureKey);
  const allowed = resolved.value === true;
  return {
    allowed,
    tierName: resolved.tierName,
    reason: allowed
      ? undefined
      : `${featureKey.replace(/_/g, " ")} requires a higher tier.`,
  };
}

/**
 * Check a numeric limit for an organization against current usage.
 * Returns { allowed, current, limit, reason, tierName }.
 */
export async function checkNumericLimit(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string,
  currentCount: number
): Promise<{
  allowed: boolean;
  current: number;
  limit: number | null;
  reason?: string;
  tierName: string;
}> {
  const resolved = await resolveFeatureValue(db, organizationId, featureKey);
  const limit = resolved.value as number | null;

  if (limit === null) {
    // Unlimited
    return {
      allowed: true,
      current: currentCount,
      limit: null,
      tierName: resolved.tierName,
    };
  }

  const allowed = currentCount < limit;
  return {
    allowed,
    current: currentCount,
    limit,
    tierName: resolved.tierName,
    reason: allowed
      ? undefined
      : `Limit reached (${currentCount}/${limit}). Upgrade your tier for more.`,
  };
}

// ==========================================
// COUNT HELPERS (reusable across mutations)
// ==========================================

export async function countActiveProjects(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  const projects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();
  return projects.length;
}

export async function countActiveVariables(
  db: DatabaseReader,
  projectId: Id<"projects">
): Promise<number> {
  const vars = await db
    .query("environmentVariables")
    .withIndex("by_project", (q) => q.eq("projectId", projectId))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();
  return vars.length;
}

export async function countMembersAndPendingInvites(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<number> {
  const now = Date.now();
  const [members, invites] = await Promise.all([
    db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .collect(),
    db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", organizationId)
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "pending"),
          q.gt(q.field("expiresAt"), now)
        )
      )
      .collect(),
  ]);
  return members.length + invites.length;
}

export async function countRotationEnabledVariables(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  excludeVariableId?: Id<"environmentVariables">
): Promise<number> {
  const projects = await db
    .query("projects")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .filter((q) => q.eq(q.field("deletedAt"), undefined))
    .collect();

  let count = 0;
  for (const project of projects) {
    const vars = await db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    for (const v of vars) {
      if (v.rotationFrequencyDays === undefined || v.rotationFrequencyDays <= 0)
        continue;
      if (excludeVariableId && v._id === excludeVariableId) continue;
      count++;
    }
  }
  return count;
}

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
      args.organizationId
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
          organizationId
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
 * Get a user's tier info including grace period status.
 */
export const getUserTierInfo = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    const tier = await getUserTier(ctx.db, args.userId);
    const tierDef = await ctx.db
      .query("tierDefinitions")
      .withIndex("by_name", (q) => q.eq("name", tier))
      .first();

    const grace = await ctx.db
      .query("subscriptionGracePeriods")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
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
 * Get all tiers that have Polar products (for pricing page).
 */
export const getAvailableTiers = query({
  args: {},
  handler: async (ctx) => {
    const tiers = await ctx.db.query("tierDefinitions").collect();
    return tiers
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((t) => ({
        name: t.name,
        displayName: t.displayName,
        description: t.description,
        color: t.color,
        sortOrder: t.sortOrder,
        isDefault: t.isDefault,
        polarProductId: t.polarProductId,
        monthlyPrice: t.monthlyPrice,
        yearlyPrice: t.yearlyPrice,
        badge: t.badge,
        badgeColor: t.badgeColor,
        ctaText: t.ctaText,
        ctaLink: t.ctaLink,
        isComingSoon: t.isComingSoon,
        highlightFeatures: t.highlightFeatures,
      }));
  },
});

/**
 * Get user's usage counters (consumption-based).
 */
export const getUserUsage = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("usageCounters")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

// ==========================================
// SEED FUNCTION (Developer-only)
// ==========================================

/**
 * All gatable features in the system.
 * When adding a new feature, add an entry here and run the seed.
 */
const SEED_FEATURES = [
  // Resources
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

  // Team
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

  // Variables
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

  // Tools
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

  // Security
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

  // Customization
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

  // Analytics
  {
    key: "analytics_retention_days",
    displayName: "Analytics Retention (days)",
    valueType: "numeric" as const,
    category: "Analytics",
    defaultValue: "7",
    resettable: false,
    sortOrder: 0,
  },

  // Security — Anomaly Detection (Dual-Gate: boolean + numeric limit)
  {
    key: "anomaly_detection",
    displayName: "Anomaly Detection",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 5,
  },
  {
    key: "anomaly_detection_limit",
    displayName: "Anomaly Detection Rules",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "0",
    resettable: false,
    sortOrder: 6,
  },

  // Support
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

/**
 * Seed the feature registry with all known features.
 * Idempotent — skips features that already exist.
 *
 * Run this during deployment or via admin migration panel.
 */
export const seedFeatureRegistry = internalMutation({
  handler: async (ctx) => {
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const f of SEED_FEATURES) {
      const existing = await ctx.db
        .query("featureRegistry")
        .withIndex("by_key", (q) => q.eq("key", f.key))
        .first();

      if (existing) {
        // Update if properties have drifted (upsert pattern)
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
            updatedAt: Date.now(),
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }

      const now = Date.now();
      await ctx.db.insert("featureRegistry", {
        key: f.key,
        displayName: f.displayName,
        description: undefined,
        valueType: f.valueType,
        category: f.category,
        defaultValue: f.defaultValue,
        resettable: f.resettable,
        sortOrder: f.sortOrder,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return { created, updated, skipped, total: SEED_FEATURES.length };
  },
});

/**
 * Seed tier-feature overrides for the default free and pro tiers.
 * Idempotent — skips overrides that already exist.
 */
export const seedDefaultTierFeatures = internalMutation({
  handler: async (ctx) => {
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
        anomaly_detection: "false",
        anomaly_detection_limit: "0",
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
        anomaly_detection: "true",
        anomaly_detection_limit: "null",
        priority_support: "true",
      },
    };

    let created = 0;
    let skipped = 0;

    for (const [tierName, features] of Object.entries(tierConfigs)) {
      for (const [featureKey, value] of Object.entries(features)) {
        const existing = await ctx.db
          .query("tierFeatures")
          .withIndex("by_tier_and_feature", (q) =>
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

    return { created, skipped };
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

// Migration function migrateOrgTiersToUserTiers has been removed.
// The organizationTiers table no longer exists (Phase 6 cleanup).
