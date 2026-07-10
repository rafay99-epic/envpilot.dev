/**
 * Compat barrel — preserves the public `api.permissionRevocationEvents.*` paths.
 * Implementation lives in features/permissions/revocationEvents.ts.
 */
export {
  listMine,
  acknowledgeMine,
  cleanup,
} from "./features/permissions/revocationEvents";
