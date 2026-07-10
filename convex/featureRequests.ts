/**
 * Compat barrel — preserves the public `api.featureRequests.*` paths.
 * Implementation lives in features/community/featureRequests/.
 */
export {
  listPublic,
  getById,
  listPlanned,
  hasVoted,
  listCategories,
} from "./features/community/featureRequests/queries";
export {
  submit,
  vote,
  unvote,
  updateStatus,
  update,
  remove,
} from "./features/community/featureRequests/mutations";
export { SEED_FEATURE_REQUESTS } from "./features/community/featureRequests/seed";
