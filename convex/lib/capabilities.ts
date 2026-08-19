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
  "project.files.create": {
    label: "Upload secret files",
    category: "Files",
    description:
      "Upload keystores, SSH keys, certificates, and service-account files",
    risk: "medium",
  },
  "project.files.update": {
    label: "Update secret files (blanket)",
    category: "Files",
    description: "Blanket write on all in-scope secret files",
    risk: "high",
  },
  "project.files.delete": {
    label: "Delete / restore secret files",
    category: "Files",
    description: "Soft-delete and restore secret files",
    risk: "high",
  },

  "project.docs.create": {
    label: "Write documentation",
    category: "Documentation",
    description:
      "Create documentation pages and edit the ones you authored. Everyone with project access can read published pages",
    risk: "low",
  },
  "project.docs.update": {
    label: "Edit any documentation page",
    category: "Documentation",
    description: "Edit pages written by other people, not only your own drafts",
    risk: "medium",
  },
  "project.docs.publish": {
    label: "Publish documentation",
    category: "Documentation",
    description:
      "Publish a draft, or return a published page to draft. Publishing is what makes a page readable by the team and by agents over MCP",
    risk: "medium",
  },
  "project.docs.delete": {
    label: "Delete / restore documentation",
    category: "Documentation",
    description: "Move pages to trash and restore them",
    risk: "medium",
  },
  "project.docs.share": {
    label: "Share documentation with teammates",
    category: "Documentation",
    description:
      "Hand a published page to a named organization member, including one who is not assigned to the project. Grants read of that one page — never the project",
    risk: "medium",
  },
  "project.docs.share.external": {
    label: "Share documentation outside the organization",
    category: "Documentation",
    description:
      "Mint a public preview link for a published page, readable by anyone holding the URL until it expires or is revoked",
    risk: "high",
  },
  /**
   * DISPLAY capability, enforced at the client — deliberately, not by
   * omission.
   *
   * Everything it governs is already on the developer's disk: the extension
   * only ever masks files it just wrote, and the read that delivered them
   * was authorized by `project.read` and the per-file grants. A backend
   * assertion here would be asserting on plaintext the caller legitimately
   * holds, which is theatre, not a gate. What the server owes the client is
   * an accurate capability map; the extension consumes this key in
   * SyncService.canRevealSecrets (fail-closed: unknown project denies, and
   * one denying project denies overall) and gates both the reveal command
   * and the unmasking direction of the cloaking toggle on it.
   */
  "project.secrets.reveal": {
    label: "Reveal secret values locally",
    category: "Access model",
    description:
      "Temporarily unmask synced .env values and secret file contents in the VS Code editor",
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
  "project.workspaces.manage": {
    label: "Manage workspace membership",
    category: "Projects",
    description:
      "Add or remove a project from a workspace. Adding one grants every reader of that project read access to the workspace's shared values, so this is the escalation point of the feature — creating a workspace is just org.projects.create, and editing its variables is the ordinary project.variables.* check on the workspace row",
    risk: "high",
  },
  "project.templates.manage": {
    label: "Manage templates",
    category: "Projects",
    description: "Create and edit custom project templates",
    risk: "low",
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
  "project:create_file": "project.files.create",
  "project:update_file": "project.files.update",
  "project:delete_file": "project.files.delete",
  "project:manage_file_permissions": "project.permissions.manage",
  "project:reveal_secrets": "project.secrets.reveal",
  "project:manage_workspaces": "project.workspaces.manage",
} as const satisfies Record<string, CapabilityKey>;

export type OrgAction = keyof typeof ORG_ACTION_TO_CAPABILITY;
export type ProjectAction = keyof typeof PROJECT_ACTION_TO_CAPABILITY;
