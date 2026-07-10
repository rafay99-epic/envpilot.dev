/**
 * Compat barrel — preserves the public `api.deviceSessions.*` paths.
 * Implementation lives in features/users/.
 */
export { record, revoke } from "./features/users/deviceSessions";
