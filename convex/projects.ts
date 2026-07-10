/**
 * Compat barrel — preserves the public `api.projects.*` path.
 * Implementation lives in features/projects/.
 */
export {
  listByOrganization,
  getById,
  getBySlug,
  listWithStats,
  listForUser,
} from "./features/projects/queries";
export { create, update, remove, move } from "./features/projects/mutations";
