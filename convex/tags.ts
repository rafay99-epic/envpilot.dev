/**
 * Compat barrel — preserves the public `api.tags.*` path.
 * Implementation lives in features/projects/tags.ts.
 */
export {
  listByOrganization,
  getById,
  create,
  update,
  remove,
  TAG_COLORS,
} from "./features/projects/tags";
