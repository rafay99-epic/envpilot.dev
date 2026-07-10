/**
 * Compat barrel — preserves the public `api.sharedSecrets.*` /
 * `internal.sharedSecrets.*` paths.
 * Implementation lives in features/sharing/.
 */
export {
  createShare,
  verifyRecipientEmail,
  restoreBurnedShare,
  verifyOtp,
  revokeShare,
} from "./features/sharing/mutations";
export {
  listByVariable,
  listActiveByOrg,
  listByProject,
} from "./features/sharing/queries";
export {
  cleanupExpiredShares,
  cleanupExpiredOtps,
} from "./features/sharing/cleanup";
export { countActiveShares } from "./features/sharing/helpers";
