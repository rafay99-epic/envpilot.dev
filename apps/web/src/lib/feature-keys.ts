/**
 * Maps legacy TierAction names to dynamic feature keys.
 * Used for backward compatibility between the old `action`-based system
 * and the new dynamic feature registry.
 */
export const ACTION_TO_FEATURE_KEY: Record<string, string> = {
  create_project: "max_projects",
  create_variable: "max_variables_per_project",
  add_team_member: "max_team_members",
  use_api: "api_access",
  use_extension: "extension_access",
  use_granular_permissions: "granular_permissions",
  view_version_history: "variable_version_history",
  bulk_import: "bulk_import",
  use_cli: "cli_access",
  bulk_delete: "bulk_delete",
  bulk_export: "bulk_export",
  use_custom_branding: "custom_branding",
};
