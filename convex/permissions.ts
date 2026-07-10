/**
 * Compat barrel — preserves the public `api.permissions.*` paths.
 * Implementation lives in features/permissions/variablePermissions/.
 */
export {
  getForVariable,
  getForUser,
  checkPermission,
  getHistory,
  getAssignableMembers,
  canManageVariablePermissions,
  getUsersWithProjectAccess,
} from "./features/permissions/variablePermissions/queries";
export { cleanupExpired } from "./features/permissions/variablePermissions/cleanup";
