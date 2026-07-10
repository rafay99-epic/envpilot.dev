/**
 * Compat barrel — preserves the public `api.admin.*` paths.
 * Implementation lives in features/admin/.
 */
export { verifySecret } from "./features/admin/auth";
export {
  getStats,
  getPaymentReadiness,
  getAnalytics,
} from "./features/admin/stats";
export {
  listUsers,
  banUser,
  unbanUser,
  listUserTiers,
  updateUserTier,
} from "./features/admin/users";
export { listOrganizations } from "./features/admin/organizations";
export {
  listContactMessages,
  markContactMessageRead,
  deleteContactMessage,
  listSupportTickets,
  updateSupportTicketStatus,
} from "./features/admin/inbox";
export {
  listAllChangelog,
  createChangelog,
  updateChangelog,
  toggleChangelogPublish,
  deleteChangelog,
} from "./features/admin/changelog";
export {
  listFeatureRequests,
  updateFeatureRequestStatus,
  updateFeatureRequestAdminNotes,
  createFeatureRequest,
  deleteFeatureRequest,
  clearAllFeatureRequests,
} from "./features/admin/featureRequests";
export {
  listTierDefinitions,
  createTierDefinition,
  updateTierDefinition,
  deleteTierDefinition,
  listPaymentProducts,
  createPaymentProduct,
  updatePaymentProduct,
  deletePaymentProduct,
  seedPaymentProducts,
  seedDefaultTiers,
} from "./features/admin/tiers";
export {
  listFeatureRegistry,
  toggleFeatureActive,
  listTierFeatures,
  setTierFeatureValue,
  removeTierFeatureOverride,
} from "./features/admin/featureFlags";
export { listMigrations, runMigration } from "./features/admin/migrations";
export {
  updateTableRow,
  deleteTableRow,
  browseTablePaginated,
} from "./features/admin/tables";
export {
  getAdminSettings,
  updateAdminSetting,
} from "./features/admin/settings";
export { listCronJobs, toggleCronPause } from "./features/admin/crons";
export {
  updateVariableExpiry,
  listRotationVariables,
} from "./features/admin/variables";
