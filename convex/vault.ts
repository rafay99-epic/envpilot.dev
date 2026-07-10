/**
 * Compat barrel — preserves the public `internal.vault.*` paths.
 * Implementation lives in features/vault/.
 */
export {
  createSecret,
  readSecret,
  updateSecret,
  deleteSecret,
} from "./features/vault/vault";
