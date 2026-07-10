/**
 * Compat barrel — preserves the public `internal.vaultGc.*` paths.
 * Implementation lives in features/vault/gc.ts.
 */
export {
  PURGE_RETENTION_DAYS,
  listPurgeEligible,
  hardDeleteVariable,
  hardDeleteAccount,
  purgeExpiredBatch,
} from "./features/vault/gc";
