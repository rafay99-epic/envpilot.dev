/**
 * Compat barrel — preserves the public `api.userPreferences.*` paths.
 * Implementation lives in features/users/.
 */
export {
  getByUserId,
  getByUserIdInternal,
  upsert,
} from "./features/users/preferences";
