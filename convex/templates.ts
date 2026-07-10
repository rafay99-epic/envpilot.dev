/**
 * Compat barrel — preserves the public `api.templates.*` path.
 * Implementation lives in features/projects/templates.ts.
 */
export {
  listAll,
  getById,
  listBuiltIn,
  search,
  create,
  update,
  remove,
} from "./features/projects/templates";
