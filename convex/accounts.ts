/**
 * Compat barrel — preserves the public `api.accounts.*` paths.
 * Implementation lives in features/accounts/.
 */
export { listWithAccess, get, getDeleted } from "./features/accounts/queries";
export {
  create,
  update,
  remove,
  restore,
  logAccess,
} from "./features/accounts/mutations";
