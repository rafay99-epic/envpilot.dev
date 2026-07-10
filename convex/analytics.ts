/**
 * Compat barrel — preserves the public `api.analytics.*` paths.
 * Implementation lives in features/admin/analytics.ts.
 */
export {
  getWebTrafficStats,
  getWebTrafficPageviews,
  getShareUrl,
} from "./features/admin/analytics";
