/**
 * Compat barrel — preserves the public `api.dashboard.*` paths.
 * Implementation lives in features/dashboard/.
 */
export {
  getStats,
  getRecentActivity,
  getRecentProjects,
  getTeamMembers,
  getOnboardingStatus,
  getAnalytics,
} from "./features/dashboard/dashboard";
