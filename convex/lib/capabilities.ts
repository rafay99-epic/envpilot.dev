/**
 * Capability catalog — the vocabulary of the role system.
 *
 * CODE-DEFINED on purpose: every capability corresponds to enforcement that
 * must exist in code, so adding one is a feature change (code review, tests,
 * deploy). Adding a ROLE, by contrast, is pure data: a roleRegistry row maps
 * these keys to booleans (see lib/roleProfiles.ts for the seeded system
 * profiles and convex/lib/seedData.ts SEED_ROLES).
 *
 * Rules:
 *  - Never compare role slugs in feature code. Ask the resolved profile.
 *  - Every legacy action string (assertOrgAction / assertProjectAction call
 *    sites) maps to exactly one capability via ACTION_TO_CAPABILITY below —
 *    call sites keep their strings, the mapping is the compat layer.
 *  - Exactly-one-owner invariants and ownership transfer stay special-cased
 *    OUTSIDE the capability system (see organizations/mutations.ts).
 */

export const CAPABILITIES = {
  // ── Organization ──────────────────────────────────────────────────────────
  "org.manage": {
    label: "Manage organization",
    category: "Organization",
    description:
      "Update, delete, or transfer the organization and its settings",
    risk: "critical",
  },
  "org.billing": {
    label: "Manage billing",
    category: "Organization",
    description: "Checkout, portal, cancellation, subscription management",
    risk: "critical",
  },
  "org.members.invite": {
    label: "Invite members",
    category: "Members",
    description:
      "Send invitations (hierarchy applies: only roles below your level)",
    risk: "high",
  },
  "org.members.remove": {
    label: "Remove / suspend members",
    category: "Members",
    description: "Remove memberships and place security holds",
    risk: "high",
  },
  "org.members.change_role": {
    label: "Change member roles",
    category: "Members",
    description: "Reassign org roles (hierarchy applies)",
    risk: "critical",
  },
  "org.sessions": {
    label: "View / revoke sessions",
    category: "Members",
    description: "See and revoke member device sessions",
    risk: "high",
  },
  "org.projects.create": {
    label: "Create projects",
    category: "Projects",
    description: "Create projects in the organization",
    risk: "medium",
  },
  "org.projects.delete": {
    label: "Delete / move projects",
    category: "Projects",
    description: "Delete projects or move them between organizations",
    risk: "critical",
  },
  "org.rollback": {
    label: "Rollback variables",
    category: "Variables",
    description: "Restore a variable to a previous version",
    risk: "high",
  },
  "org.clients.link": {
    label: "Link CLI / extension",
    category: "Tools",
    description: "Link their own devices (CLI, VS Code extension)",
    risk: "low",
  },
  "org.tags.create": {
    label: "Create tags",
    category: "Variables",
    description: "Create variable tags",
    risk: "low",
  },
  "org.tags.manage": {
    label: "Manage tags",
    category: "Variables",
    description: "Rename or delete existing tags",
    risk: "low",
  },
  "org.api_keys": {
    label: "Manage API keys",
    category: "Tools",
    description: "Create and revoke org-scoped public API keys",
    risk: "critical",
  },
  "org.audit.view": {
    label: "View audit / analytics",
    category: "Organization",
    description: "Read audit logs, compliance reports, and analytics",
    risk: "medium",
  },
  "org.community.represent": {
    label: "Represent org publicly",
    category: "Organization",
    description: "Org-attributed feature requests and votes",
    risk: "low",
  },

  // ── Project (assignment-gated; owner bypasses assignment) ─────────────────
  "project.read": {
    label: "Read project",
    category: "Projects",
    description: "See assigned projects and their variable metadata",
    risk: "low",
  },
  "project.update": {
    label: "Update project settings",
    category: "Projects",
    description: "Edit name, description, and project-level settings",
    risk: "medium",
  },
  "project.variables.create": {
    label: "Create variables",
    category: "Variables",
    description: "Create variables directly (no request flow)",
    risk: "medium",
  },
  "project.variables.update": {
    label: "Update variables (blanket)",
    category: "Variables",
    description:
      "Blanket write on all in-scope variables (also drives client file writability and CLI push)",
    risk: "high",
  },
  "project.variables.delete": {
    label: "Delete / restore variables",
    category: "Variables",
    description: "Soft-delete, bulk-delete, restore, and purge trash",
    risk: "high",
  },
  "project.accounts.create": {
    label: "Create shared accounts",
    category: "Accounts",
    description: "Create service-login accounts directly",
    risk: "medium",
  },
  "project.accounts.update": {
    label: "Update shared accounts (blanket)",
    category: "Accounts",
    description: "Blanket write on all in-scope accounts",
    risk: "high",
  },
  "project.accounts.delete": {
    label: "Delete / restore shared accounts",
    category: "Accounts",
    description: "Soft-delete and restore shared accounts",
    risk: "high",
  },
  "project.requests.submit": {
    label: "Submit requests",
    category: "Requests",
    description: "File variable/account requests for review",
    risk: "low",
  },
  "project.requests.review": {
    label: "Review requests",
    category: "Requests",
    description: "Approve or reject variable/account requests",
    risk: "high",
  },
  "project.permissions.manage": {
    label: "Manage permissions",
    category: "Members",
    description:
      "Grant/revoke per-variable and per-account access; manage CI/CD tokens",
    risk: "critical",
  },
  "project.members.manage": {
    label: "Manage project members",
    category: "Members",
    description: "Assign/unassign members and set environment scopes",
    risk: "high",
  },
  "project.share": {
    label: "Share secrets externally",
    category: "Sharing",
    description: "Create OTP share links for variables and accounts",
    risk: "critical",
  },
  "project.templates.manage": {
    label: "Manage templates",
    category: "Projects",
    description: "Create and edit custom project templates",
    risk: "low",
  },
  "project.artifacts.read": {
    label: "Read secure artifacts",
    category: "Security",
    description: "List, download, and decrypt project build artifacts",
    risk: "critical",
  },
  "project.artifacts.create": {
    label: "Create secure artifacts",
    category: "Security",
    description: "Encrypt and upload project build artifacts",
    risk: "critical",
  },
  "project.artifacts.update": {
    label: "Update secure artifacts",
    category: "Security",
    description: "Replace project build artifacts with a new encrypted version",
    risk: "critical",
  },
  "project.artifacts.delete": {
    label: "Delete secure artifacts",
    category: "Security",
    description: "Permanently delete project build artifacts and their keys",
    risk: "critical",
  },

  // ── Behavior modifiers ────────────────────────────────────────────────────
  "access.blanket_read": {
    label: "Blanket read",
    category: "Access model",
    description:
      "Sees every in-scope resource without per-resource grants (auditor style)",
    risk: "medium",
  },
  "access.grant_fallback": {
    label: "Per-resource grants",
    category: "Access model",
    description:
      "Value access resolves through per-variable/account grants (grants cap by grant permission)",
    risk: "low",
  },
  "access.env_scoped": {
    label: "Environment-scopeable",
    category: "Access model",
    description:
      "projectMembers.environments restricts this role (out-of-scope resources are invisible)",
    risk: "low",
  },
  "notify.variable_changes": {
    label: "Variable-change emails",
    category: "Notifications",
    description: "Receives variable change notification emails",
    risk: "low",
  },
} as const;

export type CapabilityKey = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

/** A role's resolved capability set. Missing key = false (fail closed). */
export type CapabilityMap = Partial<Record<CapabilityKey, boolean>>;

// ── Legacy action-string compat layer ────────────────────────────────────────
//
// Existing assertOrgAction / assertProjectAction call sites keep their action
// strings; internally each maps to exactly one capability. This table is the
// COMPLETE list of legacy actions — adding an action requires adding a
// capability mapping here, and exhaustiveness is type-checked.

export const ORG_ACTION_TO_CAPABILITY = {
  "org:update": "org.manage",
  "org:delete": "org.manage",
  "org:transfer_ownership": "org.manage",
  "org:update_settings": "org.manage",
  "org:manage_billing": "org.billing",
  "org:invite_member": "org.members.invite",
  "org:remove_member": "org.members.remove",
  "org:change_role": "org.members.change_role",
  "org:revoke_session": "org.sessions",
  "org:view_sessions": "org.sessions",
  "org:create_project": "org.projects.create",
  "org:delete_project": "org.projects.delete",
  "org:link_extension": "org.clients.link",
  "org:rollback_variable": "org.rollback",
  "org:create_tag": "org.tags.create",
  "org:manage_tag": "org.tags.manage",
} as const satisfies Record<string, CapabilityKey>;

export const PROJECT_ACTION_TO_CAPABILITY = {
  "project:read": "project.read",
  "project:update": "project.update",
  "project:create_variable": "project.variables.create",
  "project:update_variable": "project.variables.update",
  "project:delete_variable": "project.variables.delete",
  "project:manage_permissions": "project.permissions.manage",
  "project:review_requests": "project.requests.review",
  "project:manage_members": "project.members.manage",
  "project:create_account": "project.accounts.create",
  "project:update_account": "project.accounts.update",
  "project:delete_account": "project.accounts.delete",
  "project:manage_account_permissions": "project.permissions.manage",
  "project:read_artifact": "project.artifacts.read",
  "project:create_artifact": "project.artifacts.create",
  "project:update_artifact": "project.artifacts.update",
  "project:delete_artifact": "project.artifacts.delete",
} as const satisfies Record<string, CapabilityKey>;

export type OrgAction = keyof typeof ORG_ACTION_TO_CAPABILITY;
export type ProjectAction = keyof typeof PROJECT_ACTION_TO_CAPABILITY;
