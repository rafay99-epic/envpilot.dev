/**
 * Compat barrel — preserves the public `api.authz.*` path and every helper
 * import path. Helpers live in lib/authz.ts; the registered query lives in
 * features/auth/queries.ts.
 */
export {
  normalizeOrgRole,
  ROLE_LEVEL,
  roleLevel,
  ORG_ACTIONS,
  PROJECT_ACTIONS,
  toLegacyOrgRole,
  toLegacyProjectRole,
  isEnvironmentScopeAllowed,
  assertOrgAction,
  assertProjectAction,
  assertOrgMembership,
  assertCanManageUser,
  assertCanAssignRole,
  resolveProjectOrg,
  getActiveVariableGrant,
  getVariableAccess,
  getActiveAccountGrant,
  getAccountAccess,
} from "./lib/authz";
export type {
  OrgRole,
  LegacyOrgRole,
  StoredOrgRole,
  VariablePermission,
  OrgAction,
  ProjectAction,
} from "./lib/authz";
export { getMyPermissions } from "./features/auth/queries";
