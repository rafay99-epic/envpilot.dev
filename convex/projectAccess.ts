/**
 * Compat barrel — preserves the public `api.projectAccess.*` paths.
 * Implementation lives in features/users/.
 */
export {
  validateToken,
  listForCaller,
  updateLastUsed,
  refresh,
  linkExtension,
  unlinkExtension,
  cleanupExpired,
} from "./features/users/projectAccess";
