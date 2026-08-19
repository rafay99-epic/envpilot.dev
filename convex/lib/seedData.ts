// ==========================================
// SEED FUNCTION (Developer-only)
// ==========================================

/**
 * All gatable features in the system.
 * When adding a new feature, add an entry here and run the seed.
 */
export const SEED_FEATURES = [
  // Resources
  {
    key: "max_projects",
    displayName: "Max Projects",
    valueType: "numeric" as const,
    category: "Resources",
    defaultValue: "3",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "max_variables_per_project",
    displayName: "Max Variables per Project",
    valueType: "numeric" as const,
    category: "Resources",
    defaultValue: "50",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "max_organizations",
    displayName: "Max Organizations",
    valueType: "numeric" as const,
    category: "Resources",
    defaultValue: "1",
    resettable: false,
    sortOrder: 2,
  },

  // Team
  {
    key: "max_team_members",
    displayName: "Max Team Members",
    valueType: "numeric" as const,
    category: "Team",
    defaultValue: "3",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "max_invitations",
    displayName: "Max Pending Invitations",
    valueType: "numeric" as const,
    category: "Team",
    defaultValue: "5",
    resettable: false,
    sortOrder: 1,
  },

  // Variables
  {
    key: "variable_version_history",
    displayName: "Variable Version History",
    valueType: "boolean" as const,
    category: "Variables",
    defaultValue: "false",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "bulk_import",
    displayName: "Bulk Import",
    valueType: "boolean" as const,
    category: "Variables",
    defaultValue: "false",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "bulk_delete",
    displayName: "Bulk Delete",
    valueType: "boolean" as const,
    category: "Variables",
    defaultValue: "true",
    resettable: false,
    sortOrder: 2,
  },
  {
    key: "bulk_export",
    displayName: "Bulk Export",
    valueType: "boolean" as const,
    category: "Variables",
    defaultValue: "false",
    resettable: false,
    sortOrder: 3,
  },
  {
    key: "variable_tags",
    displayName: "Variable Tags",
    valueType: "boolean" as const,
    category: "Variables",
    defaultValue: "true",
    resettable: false,
    sortOrder: 4,
  },

  // Tools
  {
    key: "api_access",
    displayName: "API Access",
    valueType: "boolean" as const,
    category: "Tools",
    defaultValue: "true",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "extension_access",
    displayName: "VS Code Extension",
    valueType: "boolean" as const,
    category: "Tools",
    defaultValue: "true",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "cli_access",
    displayName: "CLI Access",
    valueType: "boolean" as const,
    category: "Tools",
    defaultValue: "true",
    resettable: false,
    sortOrder: 2,
  },
  {
    key: "jetbrains_access",
    displayName: "JetBrains IDE Plugin",
    valueType: "boolean" as const,
    category: "Tools",
    defaultValue: "true",
    resettable: false,
    sortOrder: 3,
  },
  {
    key: "vscode_unsync_customization",
    displayName: "VS Code Unsync Customization",
    valueType: "boolean" as const,
    category: "Tools",
    defaultValue: "false",
    resettable: false,
    sortOrder: 4,
  },

  // Security
  {
    key: "granular_permissions",
    displayName: "Granular Permissions",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "true",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "audit_log_retention_days",
    displayName: "Audit Log Retention (days)",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "7",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "sso_enabled",
    displayName: "SSO",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 2,
  },
  {
    key: "secret_rotation",
    displayName: "Secret Rotation & Expiry",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 3,
  },
  {
    key: "secret_rotation_limit",
    displayName: "Max Rotation-Enabled Variables",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "0",
    resettable: false,
    sortOrder: 4,
  },
  {
    key: "secret_sharing",
    displayName: "Secret Sharing Links",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 5,
  },
  {
    key: "security_hold",
    displayName: "Security Hold (Suspend Member Access)",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 6,
  },
  // Gates CONFIGURING protection. Enforcement of an existing config never
  // consults this key (lib/protection.ts), so a downgrade fails closed.
  {
    key: "protected_environments",
    displayName: "Protected Environments (Change Approval)",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 12,
  },
  {
    key: "max_active_shares",
    displayName: "Max Active Shares",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "0",
    resettable: false,
    sortOrder: 6,
  },
  {
    key: "shared_accounts",
    displayName: "Shared Accounts",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 7,
  },
  {
    key: "shared_accounts_limit",
    displayName: "Max Shared Accounts",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "0",
    resettable: false,
    sortOrder: 8,
  },
  {
    key: "secret_files",
    displayName: "Secret Files",
    valueType: "boolean" as const,
    category: "Security",
    defaultValue: "false",
    resettable: false,
    sortOrder: 9,
  },
  {
    key: "secret_files_limit",
    displayName: "Max Secret Files",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "0",
    resettable: false,
    sortOrder: 10,
  },
  {
    key: "secret_files_max_bytes",
    displayName: "Max Secret File Size (bytes)",
    valueType: "numeric" as const,
    category: "Security",
    defaultValue: "262144",
    resettable: false,
    sortOrder: 11,
  },

  // Customization
  {
    key: "keyboard_shortcuts_custom",
    displayName: "Custom Keyboard Shortcuts",
    valueType: "boolean" as const,
    category: "Customization",
    defaultValue: "true",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "custom_branding",
    displayName: "Custom Branding",
    valueType: "boolean" as const,
    category: "Customization",
    defaultValue: "false",
    resettable: false,
    sortOrder: 1,
  },

  // Analytics
  {
    key: "analytics_retention_days",
    displayName: "Analytics Retention (days)",
    valueType: "numeric" as const,
    category: "Analytics",
    defaultValue: "7",
    resettable: false,
    sortOrder: 0,
  },

  // Support
  {
    key: "priority_support",
    displayName: "Priority Support",
    valueType: "boolean" as const,
    category: "Support",
    defaultValue: "false",
    resettable: false,
    sortOrder: 0,
  },

  // Integrations
  {
    key: "public_api",
    displayName: "Public REST API",
    valueType: "boolean" as const,
    category: "Integrations",
    defaultValue: "false",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "mcp_server",
    displayName: "MCP Server",
    valueType: "boolean" as const,
    category: "Integrations",
    defaultValue: "false",
    resettable: false,
    sortOrder: 2,
  },
  {
    // The Docker image is its own surface with its own gate, NOT a rider on
    // public_api. A plan can sell container delivery without selling the
    // whole REST API, and revoking one must not revoke the other.
    key: "docker_image",
    displayName: "Docker Image",
    valueType: "boolean" as const,
    category: "Integrations",
    defaultValue: "false",
    resettable: false,
    sortOrder: 3,
  },
  {
    // Counts ACTIVE keys carrying the docker surface. Each one is a standing
    // credential that pulls plaintext on every container start, so the cost
    // being bounded is live credentials in circulation, not storage.
    key: "docker_image_limit",
    displayName: "Max Docker Keys",
    valueType: "numeric" as const,
    category: "Integrations",
    defaultValue: "0",
    resettable: false,
    sortOrder: 4,
  },
  {
    // Same unit for the Action: active keys carrying the github_action
    // surface. The Action has no boolean of its own (it rides public_api),
    // so this is the only per-surface dial it has.
    key: "github_action_limit",
    displayName: "Max GitHub Action Keys",
    valueType: "numeric" as const,
    category: "Integrations",
    defaultValue: "0",
    resettable: false,
    sortOrder: 5,
  },
  {
    key: "team_notifications",
    displayName: "Slack & Discord Notifications",
    valueType: "boolean" as const,
    category: "Integrations",
    defaultValue: "false",
    resettable: false,
    sortOrder: 6,
  },
  {
    key: "team_notifications_limit",
    displayName: "Max Notification Webhooks",
    valueType: "numeric" as const,
    category: "Integrations",
    defaultValue: "0",
    resettable: false,
    sortOrder: 7,
  },
  // Available on every tier — documentation is how a project explains itself,
  // and gating it entirely would make the free tier worse at onboarding, the
  // exact job it exists to demonstrate. Bounded by COUNT instead: pages cost
  // storage and search-index space per row, so the two limits below cap the
  // free tier rather than the boolean shutting it off.
  {
    key: "project_docs",
    displayName: "Project Documentation",
    valueType: "boolean" as const,
    category: "Collaboration",
    defaultValue: "true",
    resettable: false,
    sortOrder: 0,
  },
  {
    key: "max_docs_per_project",
    displayName: "Max Documentation Pages per Project",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 1,
  },
  {
    key: "max_docs_per_org",
    displayName: "Max Documentation Pages per Organization",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 2,
  },
  // Handing a page to a teammate costs one email per user action — no cron,
  // no recurring work — so it needs no companion limit; the docShareCreate
  // rate limit is what bounds abuse.
  {
    key: "doc_sharing",
    displayName: "Documentation Sharing",
    valueType: "boolean" as const,
    category: "Collaboration",
    defaultValue: "true",
    resettable: false,
    sortOrder: 3,
  },
  // A public link is infrastructure served to the anonymous internet for as
  // long as it lives, so this one takes the full dual gate: boolean for
  // availability, numeric for how many links may be live at once.
  {
    key: "doc_public_links",
    displayName: "Public Documentation Links",
    valueType: "boolean" as const,
    category: "Collaboration",
    defaultValue: "false",
    resettable: false,
    sortOrder: 4,
  },
  {
    key: "max_active_doc_links",
    displayName: "Max Active Public Documentation Links",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 5,
  },
  // ─── Workspaces (shared variables across projects) ───────────────────────
  //
  // No dual gate: a workspace triggers no cron, no email and no outbound
  // call. Its only recurring cost is read fan-out, which the two per-edge
  // ceilings below bound.
  {
    key: "workspaces",
    displayName: "Workspaces",
    valueType: "boolean" as const,
    category: "Collaboration",
    defaultValue: "false",
    resettable: false,
    sortOrder: 6,
  },
  {
    key: "max_workspaces",
    displayName: "Max Workspaces per Organization",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 7,
  },
  {
    key: "max_projects_per_workspace",
    displayName: "Max Projects per Workspace",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 8,
  },
  {
    key: "max_workspaces_per_project",
    displayName: "Max Workspaces per Project",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 9,
  },
  {
    key: "max_variables_per_workspace",
    displayName: "Max Variables per Workspace",
    valueType: "numeric" as const,
    category: "Collaboration",
    defaultValue: "0",
    resettable: false,
    sortOrder: 10,
  },
];

// ─── Role registry seeds ──────────────────────────────────────────────────────
//
// Consumed by runMigration's `seed-role-registry` handler (upsert by slug —
// safe to re-run; system rows update capabilities from code truth, custom
// seeded rows are inserted only if absent so admin-panel edits survive).
// Profiles live in lib/roleProfiles.ts — the golden parity suite pins the
// system profiles to pre-registry behavior.

import {
  SYSTEM_PROFILES,
  SEEDED_CUSTOM_PROFILES,
  type RoleProfile,
} from "./roleProfiles";

export interface SeedRole extends RoleProfile {
  sortOrder: number;
}

export const SEED_ROLES: SeedRole[] = [
  { ...SYSTEM_PROFILES.owner, sortOrder: 0 },
  { ...SYSTEM_PROFILES.project_manager, sortOrder: 1 },
  { ...SYSTEM_PROFILES.team_lead, sortOrder: 2 },
  { ...SEEDED_CUSTOM_PROFILES.editor, sortOrder: 3 },
  { ...SYSTEM_PROFILES.developer, sortOrder: 4 },
  { ...SEEDED_CUSTOM_PROFILES.viewer, sortOrder: 5 },
];
