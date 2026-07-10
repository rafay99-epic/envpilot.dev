/**
 * Compat barrel — preserves the public `api.featureRegistry.*` paths.
 * Implementation lives in features/featureRegistry/.
 *
 * Many other convex modules import the resolver/gate helpers via
 * "./featureRegistry"; re-exporting them here keeps those imports working.
 */

// Registered queries (client-facing).
export {
  checkFeature,
  getResolvedFeatures,
  getResolvedFeaturesBatch,
  getMyTierInfo,
  getOrgOwnerTierInfo,
  getTierByName,
  getPricingData,
} from "./features/featureRegistry/queries";

// Resolver helpers.
export {
  getUserTier,
  getOrgOwnerTier,
  resolveOrgGateContext,
  resolveFeatureValue,
  resolveFeatureForUser,
} from "./features/featureRegistry/resolver";
export type { OrgGateContext } from "./features/featureRegistry/resolver";

// Gate + count helpers.
export {
  checkBooleanFeature,
  checkNumericLimit,
  checkCountedLimit,
  countActiveProjects,
  countActiveVariables,
  countMembersAndPendingInvites,
  countRotationEnabledVariables,
  countActiveAccounts,
} from "./features/featureRegistry/gates";

// Migration function migrateOrgTiersToUserTiers has been removed.
// The organizationTiers table no longer exists (Phase 6 cleanup).
