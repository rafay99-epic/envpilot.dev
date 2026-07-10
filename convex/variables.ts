/**
 * Compat barrel — preserves the public `api.variables.*` paths.
 * Implementation lives in features/variables/.
 */
export {
  listByProject,
  listOrgVariablesWithAccess,
  listOrgVariablesWithAccessPaginated,
  getById,
  getVersionHistory,
  listWithAccess,
  listWithAccessPaginated,
  listMetadataByProject,
  search,
  globalSearchWithAccess,
  getDeleted,
} from "./features/variables/queries";
export {
  create,
  update,
  remove,
  bulkDelete,
  restore,
  rollback,
  logAccess,
} from "./features/variables/mutations";
export {
  listExpiringVariables,
  processRotationExpiry,
} from "./features/variables/rotation";
