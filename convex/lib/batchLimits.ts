/**
 * Hard structural ceiling on variables touched by ONE bulk operation
 * (template creation, import, export).
 *
 * Independent of the per-project tier limit, which is what a project may hold
 * in total. This bounds what a single request may attempt, so the work a
 * caller can queue in one action is knowable in advance. Everything downstream
 * is derived from it:
 *
 *   - the bulk entry points refuse a batch larger than this up front, instead
 *     of accepting a 10k-line dotenv file and discovering the ceiling halfway,
 *   - the variableBatchCreate / variableBatchRead rate-limit bursts are sized
 *     to it, so any batch the entry point accepts fits in one burst by
 *     construction (the same coupling MAX_PROJECT_FILES has with fileDownload).
 *
 * Raising it means raising both rate-limit capacities with it, or a batch the
 * write path accepts can never pass the limiter.
 */
export const MAX_BATCH_VARIABLES = 500;
