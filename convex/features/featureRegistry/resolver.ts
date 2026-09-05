import type { DatabaseReader } from "../../_generated/server";
import { Doc, Id } from "../../_generated/dataModel";
import {
  isEnforcementEnabledFromDb,
  getDefaultTierName,
} from "../billing/tierLimits";

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
type ResolvedFeature = {
  value: boolean | number | null;
  tierName: string;
  valueType: "boolean" | "numeric";
};

// Denied is typed by the feature: a numeric feature denies as a 0 limit, so a
// boolean never reaches a limit comparison.
function deniedValue(valueType: "boolean" | "numeric"): ResolvedFeature {
  return {
    value: valueType === "numeric" ? 0 : false,
    tierName: "unknown",
    valueType,
  };
}

function unlimitedValue(valueType: "boolean" | "numeric"): ResolvedFeature {
  return {
    value: valueType === "numeric" ? null : true,
    tierName: "unlimited",
    valueType,
  };
}

export function parseFeatureValue(
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
  organizationId: Id<"organizations">,
  // Pass the org doc when the caller already fetched it — skips a duplicate
  // ctx.db.get on every resolution
  org?: Doc<"organizations"> | null
): Promise<{ tierName: string; ownerId: Id<"users"> }> {
  const orgDoc = org ?? (await db.get(organizationId));
  if (!orgDoc) {
    throw new Error("Organization not found");
  }
  const ownerId = orgDoc.createdBy;
  const tierName = await getUserTier(db, ownerId);
  return { tierName, ownerId };
}

// ==========================================
// PER-REQUEST GATE CONTEXT (dedupe org/tier/grace reads across dual-gate calls)
// ==========================================

/**
 * Pre-resolved org/tier/grace-period context, shared across multiple
 * `resolveFeatureValue` calls for the SAME organization within one request.
 *
 * The CLAUDE.md dual-gate pattern (boolean feature + numeric limit, e.g.
 * `secret_rotation` + `secret_rotation_limit`) calls `checkBooleanFeature`
 * then `checkNumericLimit`/`checkCountedLimit` back-to-back for the same
 * org — each independently re-fetched `adminSettings`, `organizations`,
 * and `subscriptionGracePeriods`. Resolve this once via
 * `resolveOrgGateContext` and pass it to both calls to cut that ~doubled
 * read cost back to a single resolution + two `featureRegistry`/
 * `tierFeatures` lookups.
 */
export interface OrgGateContext {
  enforced: boolean;
  organizationId: Id<"organizations">;
  /** Owner's raw tier, before grace-period override. */
  ownerTierName: string;
  ownerId: Id<"users"> | null;
  /** Tier to actually resolve features against (accounts for an active grace period). */
  effectiveTier: string;
}

/**
 * Resolve the shared org/tier/grace-period context once. Pass the result to
 * `resolveFeatureValue`/`checkBooleanFeature`/`checkNumericLimit`/
 * `checkCountedLimit` for every feature key checked against the same org
 * within a single mutation/query to avoid re-fetching the same rows.
 *
 * Mirrors `resolveFeatureValue`'s own resolution chain exactly (including
 * short-circuiting the org/grace lookups entirely when enforcement is off),
 * so passing a context never changes the resolved value — only the read
 * count.
 */
export async function resolveOrgGateContext(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<OrgGateContext> {
  const enforced = await isEnforcementEnabledFromDb(db);
  if (!enforced) {
    return {
      enforced: false,
      organizationId,
      ownerTierName: "unlimited",
      ownerId: null,
      effectiveTier: "unlimited",
    };
  }

  const { tierName, ownerId } = await getOrgOwnerTier(db, organizationId);

  const grace = await db
    .query("subscriptionGracePeriods")
    .withIndex("by_user", (q) => q.eq("userId", ownerId))
    .first();

  let effectiveTier = tierName;
  if (grace?.isActive && grace.gracePeriodEnd > Date.now()) {
    effectiveTier = grace.previousTier;
  }

  return {
    enforced: true,
    organizationId,
    ownerTierName: tierName,
    ownerId,
    effectiveTier,
  };
}

// ==========================================
// CORE RESOLVER
// ==========================================

/**
 * Resolve a feature's value for an organization.
 *
 * Chain: org → owner → userTiers → grace period check → tierFeatures → featureRegistry default
 *
 * Pass a pre-resolved `context` (from `resolveOrgGateContext`) to skip the
 * `adminSettings`/`organizations`/`subscriptionGracePeriods` reads when
 * checking multiple feature keys against the same org (the dual-gate
 * boolean + numeric-limit pattern). Omit it for a single-key check — the
 * behavior and read cost are identical to before.
 */
export async function resolveFeatureValue(
  db: DatabaseReader,
  organizationId: Id<"organizations">,
  featureKey: string,
  context?: OrgGateContext
): Promise<{
  value: boolean | number | null;
  tierName: string;
  valueType: "boolean" | "numeric";
}> {
  const gate = context ?? (await resolveOrgGateContext(db, organizationId));

  // Load the feature row first: the admin kill switch (isActive false) denies
  // even when tier enforcement is off. A MISSING row keeps the pre-alpha
  // bypass when enforcement is off, and denies once it is on.
  const feature = await db
    .query("featureRegistry")
    .withIndex("by_key", (q) => q.eq("key", featureKey))
    .first();
  if (feature && !feature.isActive) return deniedValue(feature.valueType);

  if (!gate.enforced) {
    return unlimitedValue(feature?.valueType ?? "boolean");
  }

  if (!feature) return deniedValue("boolean");

  // Look up tier-specific override for the (grace-period-adjusted) effective tier
  const override = await db
    .query("tierFeatures")
    .withIndex("by_tier_and_feature", (q) =>
      q.eq("tierName", gate.effectiveTier).eq("featureKey", featureKey)
    )
    .first();

  // Parse and return
  const rawValue = override?.value ?? feature.defaultValue;
  const parsed = parseFeatureValue(rawValue, feature.valueType);

  return {
    value: parsed,
    tierName: gate.effectiveTier,
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
  // Same ordering as resolveFeatureValue: kill switch, then pre-alpha bypass,
  // then unknown-key denial.
  const feature = await db
    .query("featureRegistry")
    .withIndex("by_key", (q) => q.eq("key", featureKey))
    .first();
  if (feature && !feature.isActive) return deniedValue(feature.valueType);

  const enforced = await isEnforcementEnabledFromDb(db);
  if (!enforced) {
    return unlimitedValue(feature?.valueType ?? "boolean");
  }

  if (!feature) return deniedValue("boolean");

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
