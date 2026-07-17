// Organization hooks
export {
  useUserOrganizations,
  useOrganization,
  useOrganizationMembers,
  useAssignableRoles,
  type AssignableRole,
} from "./useOrganizations";

// Project hooks
export {
  useOrganizationProjects,
  useOrganizationProjectsWithStats,
  useProject,
  useUserProjects,
  useProjectBySlug,
} from "./useProjects";

// Variable hooks
export {
  useProjectVariables,
  useVariable,
  useVariableHistory,
  useVariablesWithAccess,
} from "./useVariables";

// Permission hooks
export {
  useVariablePermissions,
  useUserPermissions,
  useCheckPermission,
  usePermissionHistory,
  useUsersWithProjectAccess,
  useCanManageVariablePermissions,
  useAssignableMembers,
} from "./usePermissions";

// Dashboard hooks (simplified wrappers)
export {
  useProjects,
  useVariables,
  useDashboardStats,
  useRecentActivity,
  useRecentProjects,
  useTeamMembersQuickView,
  useOnboardingStatus,
  useAnalytics,
} from "./useDashboard";

// Shared account hooks (Convex reads + Vault-backed CRUD + permission grants)
export {
  useAccounts,
  useAccountGrants,
  useAssignableAccountMembers,
  useCanManageAccountPermissions,
  useGrantAccountPermission,
  useUpdateAccountPermission,
  useRevokeAccountPermission,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  useRevealAccount,
  type Account,
} from "./useAccounts";

// Feature request hooks (Wishlist)
export {
  useFeatureRequests,
  usePlannedFeatures,
  useFeatureRequest,
  useFeatureCategories,
  useHasVoted,
  useFeatureRequestMutations,
  useAdminFeatureRequestMutations,
} from "./useFeatureRequests";

// Changelog hooks
export {
  useChangelogEntries,
  useChangelogEntry,
  useChangelogByVersion,
  useChangelogByType,
  useChangelogVersions,
} from "./useChangelog";

// Tier limits hooks and utilities
export {
  useTierLimitCheck,
  // Utility functions (kept with "use" prefix for backwards compatibility)
  useLimitDescription,
  useLimitPercentage,
  // Properly named utility functions
  getLimitDescription,
  calculateLimitPercentage,
  type Tier,
  type TierAction,
} from "./useTierLimits";

// Dynamic feature gate hooks (new — preferred)
export { useFeatureGate, useUserTier, useAllFeatures } from "./useFeatureGate";

// Global search hook
export { useGlobalSearch } from "./useGlobalSearch";

// Pagination hook
export { usePagination } from "./usePagination";

// Convex user hook
export { useConvexUser } from "./useConvexUser";

// Project members hooks
export {
  useProjectMembers,
  useProjectMembership,
  useAssignableProjectMembers,
} from "./useProjectMembers";

// Favorite hooks
export { useFavoriteProjects, useToggleFavorite } from "./useFavorites";

// Expiring variables hook
export { useExpiringVariables } from "./useExpiringVariables";

// Tag hooks (direct Convex — replaces TanStack Query proxy)
export {
  useOrganizationTags,
  useCreateTag,
  useUpdateTag,
  useDeleteTag,
  type Tag,
} from "./useTags";

// Variable request hooks (direct Convex — replaces TanStack Query proxy)
export {
  useVariableRequests,
  useResolveVariableRequest,
  usePendingRequestCount,
} from "./useVariableRequests";

// Audit log hooks
export {
  useOrganizationAuditLogs,
  useOrganizationAuditLogCount,
  useProjectAuditLogs,
  useVariableAuditLogs,
  useSecurityEvents,
  useSensitiveDataAccess,
  usePermissionChanges,
  useAuditLogSummary,
  useComplianceReport,
  useRecentAlerts,
  useAlertCount,
  useAuditLogsByTimeRange,
  useAuditLogsForExport,
  useAuditMutations,
} from "./useAuditLogs";
