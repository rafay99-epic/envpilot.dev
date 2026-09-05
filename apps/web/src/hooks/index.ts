// Organization hooks
export {
  useUserOrganizations,
  useCurrentUserOrganizations,
  useCreateOrganization,
  useOrganizationBySlug,
  useOrganizationMembers,
  useOrganizationMemberCount,
  useAssignableRoles,
  type AssignableRole,
} from "./useOrganizations";

// Project hooks
export { useOrganizationProjects, useProjectBySlug } from "./useProjects";
export {
  useWorkspaces,
  useWorkspaceBySlug,
  useInheritedVariables,
  useWorkspaceActions,
} from "./useWorkspaces";
export { useAutoPageSize } from "./useAutoPageSize";
export {
  useCreateProject,
  useCreateProjectFromTemplate,
  useUpdateProject,
  useDeleteProject,
  useMoveProject,
} from "./useProjectActions";
export { useBulkJob } from "./useBulkJob";

// Variable hooks
export { useVariableHistory } from "./useVariables";

// Dashboard hooks (simplified wrappers)
export {
  useProjects,
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
  useGrantAccountPermission,
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
  useFeatureCategories,
  useFeatureRequestMutations,
} from "./useFeatureRequests";

// Tier limits hooks and utilities
export {
  useTierLimitCheck,
  calculateLimitPercentage,
  type Tier,
  type TierAction,
} from "./useTierLimits";

// Dynamic feature gate hooks (new — preferred)
export { useFeatureGate, useAllFeatures } from "./useFeatureGate";

// Global search hook
export { useGlobalSearch } from "./useGlobalSearch";

// Pagination hook
export { usePagination } from "./usePagination";

// Convex user hook
export { useConvexUser } from "./useConvexUser";

// Project members hooks
export {
  useProjectMembers,
  useAssignableProjectMembers,
  useProjectMemberActions,
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
  usePendingChangeCount,
  usePendingOrgChangeCount,
} from "./useVariableRequests";

// Audit log hooks
export { useAuditLogSummary } from "./useAuditLogs";

// Secret file hooks
export {
  useSecretFiles,
  useSecretFileGrants,
  useUploadSecretFile,
  useGetSecretFileContent,
  useUpdateSecretFile,
  useDeleteSecretFile,
  useGrantSecretFileAccess,
  useRevokeSecretFileAccess,
  fileToBase64,
  downloadBase64,
  formatBytes,
  type SecretFile,
} from "./useSecretFiles";

// Project documentation hooks
export {
  useProjectDocs,
  useDocAccess,
  useDocSearch,
  useProjectDoc,
  useCreateDoc,
  useUpdateDoc,
  usePublishDoc,
  useUnpublishDoc,
  useDeleteDoc,
  useDocShares,
  useProjectDocShares,
  useSharedWithMe,
  useHasSharedWithMe,
  useSharedDoc,
  useShareDocWithMembers,
  useRevokeDocShare,
  useMarkShareViewed,
  groupDocsByModule,
  type DocSummary,
  type DocSearchResult,
  type DocDetail,
  type DocType,
  type DocStatus,
  type DocAccess,
  type DocShareSummary,
  type DocShareScope,
  type ProjectDocShare,
  type SharedWithMeEntry,
} from "./useProjectDocs";

export { useSettingsTab } from "./useSettingsTab";
export { useUnsavedChanges } from "./useUnsavedChanges";
export { useSettingsProvenance } from "./useSettingsProvenance";

export { useNow } from "./useNow";

export { useProtection, wasRequested } from "./useProtection";
