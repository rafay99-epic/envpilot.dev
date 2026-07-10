/**
 * Compat barrel — preserves the public `api.roleCompat.*` path. Validators
 * live in lib/roleCompat.ts; the registered query lives in
 * features/auth/queries.ts.
 */
export {
  orgRoleValidator,
  legacyOrgRoleValidator,
  legacyProjectRoleValidator,
} from "./lib/roleCompat";
export { resolveLegacyRoles } from "./features/auth/queries";
