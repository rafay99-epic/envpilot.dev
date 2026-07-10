/**
 * Compat barrel — preserves the public `api.accountPermissions.*` paths.
 * Implementation lives in features/permissions/accountPermissions/.
 */
export {
  getForAccount,
  getAssignableMembers,
  canManageAccountPermissions,
} from "./features/permissions/accountPermissions/queries";
export {
  grant,
  update,
  revoke,
  cleanupExpired,
} from "./features/permissions/accountPermissions/mutations";
