/**
 * Compat barrel — preserves the public `api.changelog.*` paths.
 * Implementation lives in features/community/changelog/.
 */
export {
  listPublished,
  getById,
  getByVersion,
  listByType,
  listVersions,
} from "./features/community/changelog/queries";
export { publishScheduledEntries } from "./features/community/changelog/publish";
export { SEED_CHANGELOG } from "./features/community/changelog/seed";
