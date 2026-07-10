/**
 * Compat barrel — preserves the public `api.subscriptions.*` /
 * `internal.subscriptions.*` paths. Implementation lives in
 * features/billing/.
 */

// Read paths + internal queries
export {
  getByOrganization,
  getOwn,
  getForOrgOwner,
  getPolarCustomer,
  getOwnPolarCustomer,
  getPolarCustomerForOrgOwner,
  getProductIdForTier,
  _getPolarCustomerById,
  _getByPolarSubscriptionId,
  _getOrgById,
  _getUserOwnedOrgs,
  _mapProductToTier,
  _getUserTierName,
  _checkWebhookProcessed,
} from "./features/billing/queries";

// Webhook action + billing mutations
export {
  subscriptionStatus,
  processWebhookEvent,
  upsertPolarCustomer,
  createSubscription,
  updateSubscription,
  _syncUserTier,
  logBillingEvent,
  _recordWebhookProcessed,
  cleanupProcessedWebhooks,
} from "./features/billing/webhooks";

// Grace-period / usage-counter lifecycle
export {
  _createGracePeriod,
  _clearGracePeriod,
  expireGracePeriods,
  _resetUsageCounters,
} from "./features/billing/gracePeriods";

// Checkout
export { prepareCheckout } from "./features/billing/checkout";
