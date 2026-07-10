/**
 * Compat barrel — preserves the public `api.accountValues.*` paths.
 * Implementation lives in features/accounts/values.ts.
 */
export {
  createWithCredentials,
  updateWithCredentials,
} from "./features/accounts/values";
