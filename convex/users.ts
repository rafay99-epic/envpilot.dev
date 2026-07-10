/**
 * Compat barrel — preserves the public `api.users.*` paths.
 * Implementation lives in features/users/.
 */
export {
  getById,
  getByWorkosId,
  getByEmail,
  search,
  upsert,
  updateProfile,
  getOwnSessions,
  revokeOwnSessions,
} from "./features/users/users";
