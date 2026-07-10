/**
 * Compat barrel — preserves the public `api.variableValues.*` paths.
 * Implementation lives in features/variables/values.ts.
 */
export {
  pullValues,
  createWithValue,
  pushBulk,
  updateWithValue,
  exportValues,
  importValues,
} from "./features/variables/values";
