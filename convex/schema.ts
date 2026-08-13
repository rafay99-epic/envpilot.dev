import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Convex Schema for Envpilot
 * Real-time backend for environment variable management
 */

export default defineSchema({
  // ==========================================
  // USERS
  // ==========================================
  users: defineTable({
    // WorkOS user ID (external identifier)
    workosId: v.string(),
    // User's email address
    email: v.string(),
    // User's display name
    name: v.optional(v.string()),
    // Profile image URL
    avatarUrl: v.optional(v.string()),
    // Account creation timestamp
    createdAt: v.number(),
    // Last activity timestamp
    lastActiveAt: v.optional(v.number()),
    // Ban status
    isBanned: v.optional(v.boolean()),
    bannedAt: v.optional(v.number()),
    bannedBy: v.optional(v.string()),
    banReason: v.optional(v.string()),
  })
    .index("by_workos_id", ["workosId"])
    .index("by_email", ["email"]),

  // ==========================================
  // USER PREFERENCES
  // ==========================================
  userPreferences: defineTable({
    // Reference to the user
    userId: v.id("users"),
    // Email notification preferences
    emailNotifications: v.optional(
      v.object({
        variableChanges: v.boolean(),
        memberUpdates: v.boolean(),
        accessRequests: v.boolean(),
        securityAlerts: v.boolean(),
        rotationReminders: v.optional(v.boolean()),
      })
    ),
    // Custom keyboard shortcut overrides (shortcut ID → binding string)
    keyboardShortcuts: v.optional(v.record(v.string(), v.string())),
    // Last updated
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // ==========================================
  // ORGANIZATIONS
  // ==========================================
  organizations: defineTable({
    // Organization display name
    name: v.string(),
    // URL-friendly slug for the organization
    slug: v.string(),
    // Optional description
    description: v.optional(v.string()),
    // Organization logo URL
    logoUrl: v.optional(v.string()),
    // LEGACY — write path removed, field retained so existing rows validate; drop after a cleanup migration unsets it.
    // (`teamLeadsCanCreateProjects` was never consulted by any authorization check — a pre-unified-RBAC leftover.
    //  The `cleanup-dead-data` migration in admin.ts unsets `settings` on all orgs.)
    settings: v.optional(
      v.object({
        teamLeadsCanCreateProjects: v.boolean(),
      })
    ),
    // WorkOS organization ID (for SSO integration)
    workosOrgId: v.optional(v.string()),
    // User who created the organization
    createdBy: v.id("users"),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_workos_org_id", ["workosOrgId"])
    .index("by_created_by", ["createdBy"]),

  // ==========================================
  // ROLE REGISTRY (roles as data — see convex/lib/capabilities.ts)
  // ==========================================
  // Capability KEYS are code-defined (lib/capabilities.ts); roles map keys to
  // booleans. System roles (owner/project_manager/team_lead/developer) are
  // seeded with main-parity profiles and capability-locked in the admin
  // panel; custom roles are platform-global, created from the admin panel.
  // organizationMembers.role / invitations.role reference rows by slug.
  roleRegistry: defineTable({
    // Immutable identifier referenced by organizationMembers.role
    slug: v.string(),
    displayName: v.string(),
    description: v.string(),
    // Badge color token (web maps to its palette)
    color: v.string(),
    // Hierarchy: higher = more authority. Strictly-below rules compare this.
    level: v.number(),
    // Seeded system role: capability matrix immutable, cannot be deactivated
    isSystem: v.boolean(),
    // Inactive roles cannot be assigned; deactivation is blocked while any
    // member or pending invitation still holds the slug
    isActive: v.boolean(),
    sortOrder: v.number(),
    // capabilityKey -> granted. Missing key = false (fail closed).
    capabilities: v.record(v.string(), v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive", "sortOrder"]),

  // ==========================================
  // ORGANIZATION MEMBERS
  // ==========================================
  organizationMembers: defineTable({
    // Reference to the organization
    organizationId: v.id("organizations"),
    // Reference to the user
    userId: v.id("users"),
    // Unified role within the organization (single source of truth for what
    // the user can do; project scope comes from projectMembers assignments)
    // Role slug — references roleRegistry.slug (system slugs seeded; custom
    // roles admin-panel created). Legacy values admin/member normalize at
    // read time. Validation against the registry happens in the invite /
    // change-role mutations — the schema stays open so registry rows are
    // the single source of truth.
    role: v.string(),
    // When the member joined
    joinedAt: v.number(),
    // Who invited them (null if they created the org)
    invitedBy: v.optional(v.id("users")),
    // Security hold: "suspended" freezes ALL access org-wide (enforced at the
    // authz choke points in convex/lib/authz.ts) while keeping the membership,
    // role, project assignments, and grants intact for later reinstatement.
    // Absent means "active" (additive — no migration needed).
    status: v.optional(v.union(v.literal("active"), v.literal("suspended"))),
    suspendedAt: v.optional(v.number()),
    suspendedBy: v.optional(v.id("users")),
    // Admin-facing reason, shown in the audit log — never to the target.
    suspendReason: v.optional(v.string()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["organizationId", "userId"]),

  // Exit records for users whose membership ended (removed / left / org
  // deleted) so the next sign-in can show "your access to X was revoked —
  // contact your organization" instead of the org silently vanishing. The
  // removed user learns org name + date + kind only; who/why stays in the
  // admin audit log. Voided (acknowledged) when the user acknowledges the
  // notice or accepts a new invitation to the same org; a cron deletes
  // acknowledged rows after 30 days.
  membershipTombstones: defineTable({
    userId: v.id("users"),
    organizationId: v.id("organizations"),
    // Snapshot — the organization may be renamed or deleted later.
    organizationName: v.string(),
    kind: v.union(
      v.literal("removed"),
      v.literal("left"),
      v.literal("org_deleted")
    ),
    createdAt: v.number(),
    acknowledged: v.boolean(),
  })
    .index("by_user", ["userId", "acknowledged"])
    .index("by_org_and_user", ["organizationId", "userId"])
    .index("by_acknowledged", ["acknowledged", "createdAt"]),

  // ==========================================
  // PROJECTS
  // ==========================================
  projects: defineTable({
    // Project display name
    name: v.string(),
    // URL-friendly slug
    slug: v.string(),
    // Optional description
    description: v.optional(v.string()),
    // Parent organization
    organizationId: v.id("organizations"),
    // Project icon (emoji or URL)
    icon: v.optional(v.string()),
    // Project color (hex code for UI)
    color: v.optional(v.string()),
    // User who created the project
    createdBy: v.id("users"),
    // Delete synced .env files when VS Code closes (project default).
    // Absent = true (secure default). Customizing it is pro-gated
    // (vscode_unsync_customization); pullValues re-checks the gate at read
    // time, so free/downgraded orgs always resolve to true.
    vscodeAutoUnsyncOnClose: v.optional(v.boolean()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_deleted_at", ["organizationId", "deletedAt"])
    .index("by_org_and_slug", ["organizationId", "slug"])
    .index("by_created_by", ["createdBy"]),

  // ==========================================
  // FAVORITE PROJECTS
  // ==========================================
  favoriteProjects: defineTable({
    userId: v.id("users"),
    projectId: v.id("projects"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_project", ["userId", "projectId"])
    .index("by_project", ["projectId"]),

  // ==========================================
  // PROJECT MEMBERS (Project-level access control)
  // ==========================================
  projectMembers: defineTable({
    // Reference to the project
    projectId: v.id("projects"),
    // Reference to the user
    userId: v.id("users"),
    // LEGACY project-level role — the unified role model derives project
    // capabilities from organizationMembers.role; this field is ignored by
    // new code and only kept so pre-migration rows validate.
    role: v.optional(
      v.union(v.literal("viewer"), v.literal("developer"), v.literal("manager"))
    ),
    // Environment scope for this assignment (developers only). A variable is
    // accessible only if ALL of its environments are in this list. Absent =
    // unrestricted (all environments).
    environments: v.optional(v.array(v.string())),
    // Who added this member to the project
    addedBy: v.id("users"),
    // When the member was added
    addedAt: v.number(),
    // Per-member override of the project's vscodeAutoUnsyncOnClose default.
    // Absent = inherit project setting. Pro-gated like the project flag.
    vscodeAutoUnsyncOnClose: v.optional(v.boolean()),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_project_and_user", ["projectId", "userId"]),

  // ==========================================
  // ENVIRONMENT VARIABLES
  // ==========================================
  environmentVariables: defineTable({
    // The variable key (e.g., "DATABASE_URL")
    key: v.string(),
    // Encrypted value reference (stored in WorkOS Vault)
    // This is NOT the actual value, just a reference ID
    vaultRef: v.string(),
    // Optional human-readable description
    description: v.optional(v.string()),
    // Environment tags (e.g., ["development", "staging", "production"])
    environments: v.array(v.string()),
    // Parent project
    projectId: v.id("projects"),
    // Whether this is a sensitive/secret value (extra protection)
    isSensitive: v.boolean(),
    // User who created the variable
    createdBy: v.id("users"),
    // User who last modified the variable
    lastModifiedBy: v.id("users"),
    // Current version number (for tracking changes)
    version: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
    // Secret rotation & expiry fields
    rotationFrequencyDays: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    lastRotatedAt: v.optional(v.number()),
    rotationStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("expiring_soon"),
        v.literal("expired")
      )
    ),
    lastReminderSentAt: v.optional(v.number()),
    // Variable tags (organization-scoped tag references)
    tagIds: v.optional(v.array(v.id("variableTags"))),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_key", ["projectId", "key"])
    .index("by_project_and_environments", ["projectId", "environments"])
    .index("by_expires_at", ["expiresAt"])
    // Bounds the daily vault-GC sweep to soft-deleted rows past the retention
    // window. deletedAt is optional; undefined sorts BELOW all numbers in
    // Convex's index ordering, so the GC query pairs a `gt(0)` floor with a
    // `lt(cutoff)` ceiling to exclude never-deleted (undefined) rows.
    .index("by_deleted_at", ["deletedAt"])
    // Serves the per-project trash listing (getDeleted): reads exactly the
    // project's soft-deleted rows in the restore window, instead of paging
    // through active rows and filtering in memory.
    .index("by_project_deleted", ["projectId", "deletedAt"])
    // Reverse lookup used by vaultReveal to authorize a value reveal by its
    // opaque vaultRef (the browser reveal path holds the ref, not the id).
    .index("by_vaultRef", ["vaultRef"]),

  // ==========================================
  // VARIABLE TAGS (organization-scoped)
  // ==========================================
  variableTags: defineTable({
    // Parent organization
    organizationId: v.id("organizations"),
    // Tag display name (e.g., "Database", "AWS")
    name: v.string(),
    // Tag color (hex, e.g., "#3b82f6")
    color: v.string(),
    // User who created the tag
    createdBy: v.id("users"),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_deleted_at", ["organizationId", "deletedAt"])
    .index("by_organization_and_name", ["organizationId", "name"]),

  // ==========================================
  // ENVIRONMENT VARIABLE REQUESTS
  // ==========================================
  environmentVariableRequests: defineTable({
    // The requested variable key (e.g., "DATABASE_URL")
    key: v.string(),
    // Encrypted value reference proposed by the requester. Absent =
    // VALUELESS request (machine-originated): agents never propose secret
    // values — the reviewer supplies one at approval (approveWithValue).
    vaultRef: v.optional(v.string()),
    // Optional human-readable description. REQUIRED (as the justification
    // shown to the approver) on machine-originated requests.
    description: v.optional(v.string()),
    // Environment tags (e.g., ["development", "staging", "production"])
    environments: v.array(v.string()),
    // Parent project
    projectId: v.id("projects"),
    // Parent organization (denormalized for easier querying)
    organizationId: v.id("organizations"),
    // Whether this is sensitive/secret
    isSensitive: v.boolean(),
    // User who requested this variable. For machine-originated requests
    // this is the KEY CREATOR (the field is load-bearing for visibility,
    // dedupe, and emails) with requestedByKeyId carrying the real principal.
    requestedBy: v.id("users"),
    // Set only on machine-originated requests: the API key that filed it.
    // Every UI/email surface renders the key (with an automated-origin
    // badge) instead of the human when this is present, and approval skips
    // the requester write-permission grant.
    requestedByKeyId: v.optional(v.id("apiKeys")),
    // Request lifecycle status
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    ),
    // Optional reviewer decision note
    reviewReason: v.optional(v.string()),
    // Reviewer metadata
    reviewedBy: v.optional(v.id("users")),
    reviewedAt: v.optional(v.number()),
    // If approved, the created variable
    createdVariableId: v.optional(v.id("environmentVariables")),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_organization", ["organizationId"])
    .index("by_requester", ["requestedBy"])
    .index("by_status", ["status"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_organization_and_status", ["organizationId", "status"])
    .index("by_project_and_requester", ["projectId", "requestedBy"])
    .index("by_project_and_key", ["projectId", "key"])
    // Per-key open-pendings cap + revoke-time visibility for machine requests
    .index("by_requested_key_and_status", ["requestedByKeyId", "status"]),

  // ==========================================
  // VARIABLE VERSIONS (History)
  // ==========================================
  variableVersions: defineTable({
    // Reference to the environment variable
    variableId: v.id("environmentVariables"),
    // Version number
    version: v.number(),
    // Encrypted value reference at this version
    vaultRef: v.string(),
    // Description at this version
    description: v.optional(v.string()),
    // Environments at this version
    environments: v.array(v.string()),
    // User who made this change
    changedBy: v.id("users"),
    // Change reason/comment
    changeReason: v.optional(v.string()),
    // Timestamp of this version
    createdAt: v.number(),
  })
    .index("by_variable", ["variableId"])
    .index("by_variable_and_version", ["variableId", "version"])
    // Reverse lookup for vaultReveal: a historical version's value is revealed
    // by its own per-version vaultRef (the diff view holds refs, not ids).
    .index("by_vaultRef", ["vaultRef"]),

  // ==========================================
  // VARIABLE ACCESS PERMISSIONS
  // ==========================================
  variablePermissions: defineTable({
    // Reference to the environment variable
    variableId: v.id("environmentVariables"),
    // Reference to the user granted access
    userId: v.id("users"),
    // Permission level
    permission: v.union(
      v.literal("read"), // Can view the variable value
      v.literal("write"), // Can modify the variable
      v.literal("admin") // Can manage permissions
    ),
    // Who granted this permission
    grantedBy: v.id("users"),
    // When the permission was granted
    grantedAt: v.number(),
    // Optional expiration (for temporary access)
    expiresAt: v.optional(v.number()),
    // Is this permission currently active?
    isActive: v.boolean(),
    // When the permission was revoked (if applicable)
    revokedAt: v.optional(v.number()),
    // Who revoked it
    revokedBy: v.optional(v.id("users")),
  })
    .index("by_variable", ["variableId"])
    .index("by_user", ["userId"])
    .index("by_variable_and_user", ["variableId", "userId"])
    .index("by_user_active", ["userId", "isActive"])
    // Bounds the daily permission-expiry sweep (permissions.cleanupExpired) to
    // active rows that actually carry an expiry. expiresAt is optional;
    // undefined sorts BELOW all numbers in Convex's index ordering (same
    // caveat as environmentVariables.by_deleted_at), so the sweep pairs a
    // `gt(0)` floor with an `lte(now)` ceiling to exclude permanent
    // (no-expiry) grants at the index level instead of reading every grant
    // ever issued, across every tenant, every day.
    .index("by_active_and_expires", ["isActive", "expiresAt"]),

  // ==========================================
  // PROJECT ACCOUNTS (Shared service-account credentials)
  // Username/password stored encrypted in WorkOS Vault (one JSON secret per
  // account); Convex holds only the vault reference + non-secret metadata.
  // RBAC + environment scoping mirror environmentVariables exactly.
  // ==========================================
  projectAccounts: defineTable({
    // Display label, e.g. "Stripe Dashboard"
    name: v.string(),
    // Validated https?:// URL (optional)
    websiteUrl: v.optional(v.string()),
    // WorkOS Vault reference holding JSON {"username","password"}.
    // This is NOT the actual credentials, just a reference ID.
    vaultRef: v.string(),
    // Optional human-readable description
    description: v.optional(v.string()),
    // Environment tags (e.g., ["development", "staging", "production"]); >= 1
    environments: v.array(v.string()),
    // Parent project
    projectId: v.id("projects"),
    // User who created the account
    createdBy: v.id("users"),
    // User who last modified the account
    lastModifiedBy: v.id("users"),
    // Current version number (for tracking changes)
    version: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_name", ["projectId", "name"])
    // Bounds the daily vault-GC sweep to soft-deleted rows past the retention
    // window (see environmentVariables.by_deleted_at for the ordering caveat).
    .index("by_deleted_at", ["deletedAt"])
    // Serves the per-project trash listing (getDeleted) — see the twin index
    // on environmentVariables.
    .index("by_project_deleted", ["projectId", "deletedAt"])
    // Reverse lookup for vaultReveal: an account's credentials are revealed by
    // its opaque vaultRef.
    .index("by_vaultRef", ["vaultRef"]),

  // ==========================================
  // ACCOUNT ACCESS PERMISSIONS (per-account grants)
  // EXACT mirror of variablePermissions (no legacy "admin" level).
  // ==========================================
  accountPermissions: defineTable({
    // Reference to the project account
    accountId: v.id("projectAccounts"),
    // Reference to the user granted access
    userId: v.id("users"),
    // Permission level
    permission: v.union(
      v.literal("read"), // Can view the account credentials
      v.literal("write") // Can modify the account
    ),
    // Who granted this permission
    grantedBy: v.id("users"),
    // When the permission was granted
    grantedAt: v.number(),
    // Optional expiration (for temporary access)
    expiresAt: v.optional(v.number()),
    // Is this permission currently active?
    isActive: v.boolean(),
    // When the permission was revoked (if applicable)
    revokedAt: v.optional(v.number()),
    // Who revoked it
    revokedBy: v.optional(v.id("users")),
  })
    .index("by_account", ["accountId"])
    .index("by_user", ["userId"])
    .index("by_account_and_user", ["accountId", "userId"])
    .index("by_user_active", ["userId", "isActive"])
    // Bounds the daily permission-expiry sweep (accountPermissions.cleanupExpired)
    // — see the twin index on variablePermissions.by_active_and_expires for
    // the ordering rationale.
    .index("by_active_and_expires", ["isActive", "expiresAt"]),

  // ==========================================
  // SECRET FILES (envelope-encrypted project files)
  // ==========================================
  // Structural mirror of projectAccounts: same lifecycle, trash window, GC,
  // and audit surface. The difference is WHERE the secret lives. A variable's
  // or account's plaintext is the Vault object; a file's Vault object holds
  // only the AES-256-GCM data key + nonce, and the ciphertext lives in Convex
  // file storage. Neither store alone can reveal the file.
  projectFiles: defineTable({
    // Display label, e.g. "Android Upload Keystore"
    name: v.string(),
    // Destination path relative to the project root, e.g.
    // "android/app/upload.jks". Validated + normalized on every write (see
    // features/files/helpers.ts::normalizeFilePath) — never absolute, never
    // containing "..", never inside .git/ or .envpilot.
    path: v.string(),
    // POSIX mode the clients apply after writing. "0600" (default) or "0400".
    mode: v.optional(v.string()),
    // Best-effort MIME type from the upload, for the dashboard icon only.
    contentType: v.optional(v.string()),
    // PLAINTEXT byte length. Drives the tier byte limit and the UI — the
    // stored blob is larger (GCM tag) and is never the number shown.
    size: v.number(),
    // sha256(digestSalt || plaintext), base64. Lets every client answer
    // "is my local copy current?" with NO decrypt and NO vault round trip.
    sha256: v.string(),
    // 16 random bytes, base64. Salts the digest so a database dump cannot be
    // rainbow-tabled back to the contents of a low-entropy file.
    digestSalt: v.string(),
    // WorkOS Vault reference holding {alg,k,iv} — the data key, NOT the file.
    vaultRef: v.string(),
    // Convex file storage id holding the AES-256-GCM ciphertext. Required:
    // a row without it is unreadable by construction.
    storageId: v.id("_storage"),
    // Optional human-readable description
    description: v.optional(v.string()),
    // Environment tags; >= 1. Two active files may share a `path` only when
    // their environments are DISJOINT (see helpers.findFilePathConflicts).
    environments: v.array(v.string()),
    // Parent project
    projectId: v.id("projects"),
    // User who uploaded the file
    createdBy: v.id("users"),
    // User who last replaced or edited it
    lastModifiedBy: v.id("users"),
    // Current version number (bumped on every content replace)
    version: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_path", ["projectId", "path"])
    // Bounds the daily vault-GC sweep to soft-deleted rows past the retention
    // window (see environmentVariables.by_deleted_at for the ordering caveat).
    .index("by_deleted_at", ["deletedAt"])
    // Serves the per-project trash listing — see the twin index on
    // environmentVariables.
    .index("by_project_deleted", ["projectId", "deletedAt"])
    // Reverse lookup for the download path: a file is authorized by its
    // opaque vaultRef, exactly like variables and accounts.
    .index("by_vaultRef", ["vaultRef"]),

  // ==========================================
  // SECRET FILE ACCESS PERMISSIONS (per-file grants)
  // EXACT mirror of accountPermissions.
  // ==========================================
  filePermissions: defineTable({
    // Reference to the secret file
    fileId: v.id("projectFiles"),
    // Reference to the user granted access
    userId: v.id("users"),
    // Permission level
    permission: v.union(
      v.literal("read"), // Can download the file
      v.literal("write") // Can replace or edit the file
    ),
    // Who granted this permission
    grantedBy: v.id("users"),
    // When the permission was granted
    grantedAt: v.number(),
    // Optional expiration (for temporary access)
    expiresAt: v.optional(v.number()),
    // Is this permission currently active?
    isActive: v.boolean(),
    // When the permission was revoked (if applicable)
    revokedAt: v.optional(v.number()),
    // Who revoked it
    revokedBy: v.optional(v.id("users")),
  })
    .index("by_file", ["fileId"])
    .index("by_user", ["userId"])
    .index("by_file_and_user", ["fileId", "userId"])
    .index("by_user_active", ["userId", "isActive"])
    // Bounds the daily permission-expiry sweep — see the twin index on
    // accountPermissions.by_active_and_expires.
    .index("by_active_and_expires", ["isActive", "expiresAt"]),

  // ==========================================
  // PROJECT DOCUMENTATION (agent-authored, human-published)
  // ==========================================
  // An agent proposes a DRAFT over MCP; publishing is a human act. Drafts are
  // invisible to teammates AND to every MCP read — the primary control against
  // a prompt-injected page reaching another agent.
  //
  // Docs name variable KEYS, never values: the only authorized decrypt path is
  // features/api/reads.ts, and resolving a value here would route around it.
  docs: defineTable({
    projectId: v.id("projects"),
    // Sidebar grouping. A string, not a tree — a tree drags in
    // move/reorder/orphan/breadcrumb handling for no gain.
    module: v.string(),
    // Picks the create-time template. NOT a structured contract: schemas
    // would be opaque strings either way, so structure buys no validation.
    type: v.union(v.literal("api"), v.literal("guide")),
    title: v.string(),
    // Unique per project among non-deleted rows (enforced in mutations).
    slug: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    // First ~200 chars, so list views render previews without reading
    // docContent — these are reactive subscriptions and Convex bills reads.
    excerpt: v.optional(v.string()),
    authorId: v.id("users"),
    // May differ from the author for Team Lead+.
    publishedBy: v.optional(v.id("users")),
    // Plain string: a pasted URL needs no integration, and a GitHub App can
    // fill it later without a schema change.
    prUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
    // Soft delete; daily GC purges past the retention window.
    deletedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_project_and_module", ["projectId", "module"])
    // A module share reads exactly the pages it serves. Without deletedAt and
    // status in the key, a `take` over (project, module) fills up with drafts
    // and trashed rows first, so a large module silently serves a partial —
    // or empty — index while reading more rows than it needs.
    .index("by_project_module_live", [
      "projectId",
      "module",
      "deletedAt",
      "status",
    ])
    // O(log n) slug resolution for the page route. Without it every page view
    // scans the project's whole doc list.
    .index("by_project_and_slug", ["projectId", "slug"])
    // Serves the per-project trash listing.
    .index("by_project_deleted", ["projectId", "deletedAt"])
    // Bounds the daily purge sweep to soft-deleted rows.
    .index("by_deleted_at", ["deletedAt"])
    // `filterFields` pre-filter INSIDE the index, so a published-only search
    // never reads a draft row — cost win and security property at once.
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["projectId", "status"],
    }),

  // Bodies, 1:1 with `docs`. Split so list views never read markdown they
  // won't render. `by_projectId` lets project deletion drain without walking
  // the parent. All access via features/docs/content.ts.
  docContent: defineTable({
    docId: v.id("docs"),
    projectId: v.id("projects"),
    body: v.string(),
    // Denormalized from docs.status so the body index can pre-filter drafts —
    // a search index may only filter on its own table's fields. Without it a
    // body search reads every match, drafts included. features/docs/content.ts
    // is the ONLY writer, so the rows cannot drift.
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  })
    .index("by_docId", ["docId"])
    .index("by_projectId", ["projectId"])
    // Finds a page by what it SAYS, not just its title.
    .searchIndex("search_body", {
      searchField: "body",
      filterFields: ["projectId", "status"],
    }),

  // Hands ONE published page to ONE reader. Two audiences, one table, one
  // gate chain (features/docs/shareGuards.ts).
  //
  // A share is a grant to a PERSON, never to a machine identity: the MCP and
  // REST read paths must never consult this table, or a per-user grant would
  // silently widen what an org-scoped API key can read.
  //
  // Every gate is re-checked on READ, not trusted from create time. Status is
  // a fast path; unpublishing, trashing, expiry, losing membership and a tier
  // downgrade all have to kill a live link, and only a read-time check does.
  docShares: defineTable({
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),

    audience: v.union(v.literal("member"), v.literal("external")),

    // WHAT is shared. Absent ⇒ "page" (rows created before module sharing
    // existed) — normalize on read, the sharedSecrets.resourceType pattern.
    //
    // A module share is a subscription, not a snapshot: it names a module and
    // the published pages in it are resolved at READ time, so a page
    // published into the module later is covered without re-sharing, and one
    // unpublished drops out on its own. That is the whole reason it exists —
    // otherwise it is just N page shares and N emails.
    scope: v.optional(v.union(v.literal("page"), v.literal("module"))),

    // Set when scope is "page". Optional because a module share names no
    // single page.
    docId: v.optional(v.id("docs")),
    // Set when scope is "module". Matches `docs.module` within `projectId`.
    module: v.optional(v.string()),

    // audience "member": a named person inside the organization. Resolved
    // server-side from org membership — the client never picks a user id.
    recipientUserId: v.optional(v.id("users")),

    // audience "external": the token IS the credential (dshr_ + 64 hex).
    token: v.optional(v.string()),
    // scrypt(passphrase, salt). The passphrase itself is never stored, never
    // logged, and never mailed alongside the link.
    passphraseHash: v.optional(v.string()),
    passphraseSalt: v.optional(v.string()),
    // Who the link was mailed to, for the audit trail only — it does NOT gate
    // the read. Anyone holding the URL can open it.
    recipientEmail: v.optional(v.string()),

    /** One line from the sender, shown to the reader. */
    note: v.optional(v.string()),

    status: v.union(
      v.literal("active"),
      v.literal("expired"),
      v.literal("revoked")
    ),
    // Mandatory on BOTH audiences. There is no permanent share.
    expiresAt: v.number(),
    viewCount: v.number(),
    lastViewedAt: v.optional(v.number()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
  })
    // O(log n) public read — the only lookup an anonymous request performs.
    .index("by_token", ["token"])
    // Status is part of every per-page read's key, never a post-read filter:
    // ordered by creation alone, a `take` would return a page's REVOKED
    // history first, so a page shared often enough would report no active
    // shares and its live links could not be revoked from the UI.
    //
    // The bare `docId` prefix of this index also serves the purge cascade,
    // which wants every row for a page regardless of status — hence no
    // separate `by_doc`.
    .index("by_doc_status", ["docId", "status"])
    // Upsert key: re-sharing a page to the same person refreshes the grant
    // instead of stacking a second row (and a second email). Status is in the
    // key for the same reason as above — the lookup wants the ACTIVE grant,
    // and a pair with a long revoke history would otherwise be a scan.
    .index("by_doc_recipient_status", ["docId", "recipientUserId", "status"])
    .index("by_recipient_status", ["recipientUserId", "status"])
    // Bounds the active-link count behind max_active_doc_links. Audience is
    // in the key because that count is about PUBLIC links only — without it
    // the read walks every active member share in the organization too, and
    // member shares have no cap to bound them.
    // expiresAt last so the count behind max_active_doc_links can range on it:
    // past-TTL rows are excluded by the INDEX rather than read and filtered,
    // which makes `take(limit + 1)` an exact answer instead of a sample.
    .index("by_org_audience_status", [
      "organizationId",
      "audience",
      "status",
      "expiresAt",
    ])
    // Bounds the hourly expiry sweep to rows that can actually expire.
    .index("by_status_and_expires", ["status", "expiresAt"])
    // Every share in a project, for the project's Shared tab — which lists
    // page and module shares together and must not read the whole org.
    .index("by_project_status", ["projectId", "status"])
    // Module shares covering one module. Every documentation page view asks
    // "is a module share serving this page too?", so that question has to be
    // an exact range — without the module in the key it is a scan of the
    // project's entire share history on every page open.
    .index("by_project_module_status", ["projectId", "module", "status"]),

  // ==========================================
  // PROJECT ACCESS (for extension linking)
  // ==========================================
  projectAccess: defineTable({
    // Reference to the project
    projectId: v.id("projects"),
    // Reference to the user
    userId: v.id("users"),
    // Access token for extension authentication
    accessToken: v.string(),
    // Token expiration
    expiresAt: v.number(),
    // Device/extension identifier
    deviceId: v.optional(v.string()),
    // Device name (e.g., "VS Code - MacBook Pro")
    deviceName: v.optional(v.string()),
    // Last used timestamp
    lastUsedAt: v.optional(v.number()),
    // Is this access currently active?
    isActive: v.boolean(),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    .index("by_access_token", ["accessToken"])
    .index("by_project_and_user", ["projectId", "userId"])
    .index("by_active_and_expires", ["isActive", "expiresAt"]),

  // ==========================================
  // CI/CD SERVICE TOKENS (machine identities)
  // ==========================================
  // The legacy `serviceTokens` table (CI/CD pull tokens) is RETIRED: every
  // row was drained into apiKeys (surfaces: [github_action]) by the
  // migrate-service-tokens migration before this definition was removed.
  // Convex keeps any leftover rows as unvalidated data — purge them from
  // the dashboard once the drain is confirmed.

  // ==========================================
  // API KEYS (generalized token platform)
  // ==========================================
  // Evolves serviceTokens into a scoped platform serving the public REST API,
  // the MCP server, AND (via a compat lookup in cicd/pull.ts) the legacy
  // CI/CD pull surface. Only the SHA-256 hash is ever stored — the plaintext
  // (`envpk_<40 hex>`) is returned exactly once from `create`. A key is
  // scoped to project(s) ("all" = org-wide, owner-only to create), an
  // environment list ("all" = every environment), and a subset of resource
  // types. Revocation is immediate (revokedAt set); expiresAt is an optional
  // absolute cutoff, checked identically to revocation at authorize time.
  apiKeys: defineTable({
    organizationId: v.id("organizations"),
    // Human label ("Vercel deploy hook", "Terraform CI")
    name: v.string(),
    // SHA-256 hex of the plaintext key — the only stored credential form
    tokenHash: v.string(),
    // "all" = org-wide (owner-only to create); otherwise an explicit project list
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    // "all" = every environment; otherwise an explicit environment list
    scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
    // Subset of ["variables", "accounts", "projects"]
    scopeResources: v.array(v.string()),
    // Which machine surfaces may present this key. Absent = key predates the
    // surfaces field and is valid on EVERY surface (grandfathered — exactly
    // the behavior it was minted under). New keys always set it explicitly.
    // github_action keys are constrained at create time to a single project
    // + the "variables" resource (the only shape the Action pull accepts).
    surfaces: v.optional(
      v.array(
        v.union(
          v.literal("github_action"),
          v.literal("rest_api"),
          v.literal("mcp_server")
        )
      )
    ),
    createdBy: v.id("users"),
    createdAt: v.number(),
    // Set on every successful authorized use that opts into recording it
    // (metadata reads skip this — see authorize.ts's `recordUse` arg)
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
    // Optional absolute expiry — expired keys get the same uniform "invalid
    // or revoked" denial as a revoked key (never a distinct signal)
    expiresAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_organization", ["organizationId"]),

  // ==========================================
  // ORG NOTIFICATION WEBHOOKS (Slack / Discord)
  // ==========================================
  // Outbound notification endpoints for org activity. Webhook capability URLs
  // live encrypted in WorkOS Vault; Convex stores only the opaque reference and
  // a non-sensitive masked preview. OAuth access tokens are discarded.
  orgWebhooks: defineTable({
    organizationId: v.id("organizations"),
    // Optional project routing. Absent means organization-wide; when set,
    // only audit events carrying one of these project IDs reach the endpoint.
    projectIds: v.optional(v.array(v.id("projects"))),
    // Display label — the channel name for OAuth rows, user-chosen for manual
    name: v.string(),
    type: v.union(v.literal("slack"), v.literal("discord")),
    // How the URL arrived — OAuth rows can show their channel; manual rows mask
    source: v.union(v.literal("oauth"), v.literal("manual")),
    vaultRef: v.string(),
    urlPreview: v.string(),
    // Channel name from the OAuth response (e.g. "#eng-alerts")
    channel: v.optional(v.string()),
    // Subscribed event groups:
    // "variables" | "requests" | "members" | "security" | "docs"
    eventGroups: v.array(
      v.union(
        v.literal("variables"),
        v.literal("requests"),
        v.literal("members"),
        v.literal("security"),
        // Documentation publishes. Its own group rather than piggybacking
        // "variables": a handoff notice and a secret change are different
        // events, and nobody subscribing to one wants the other.
        v.literal("docs")
      )
    ),
    enabled: v.boolean(),
    // Consecutive delivery failures — auto-disabled when it hits the cap
    failCount: v.number(),
    // Last delivery HTTP status
    lastStatus: v.optional(v.number()),
    lastSentAt: v.optional(v.number()),
    // Mutation-reserved delivery lane. New events for one endpoint are spaced
    // apart before actions are scheduled, preventing concurrent rate-limit
    // bursts from turning a healthy Slack/Discord endpoint into a failure herd.
    nextDeliveryAt: v.optional(v.number()),
    // Provider Retry-After embargo checked by every action, including work
    // that was already scheduled before the rate-limit response arrived.
    deliveryEmbargoUntil: v.optional(v.number()),
    // Incremented on pause/resume so old scheduled work cannot cross the
    // state transition and post after a quick re-enable.
    queueGeneration: v.optional(v.number()),
    // Short lease held only while one delivery action is allowed to perform
    // its outbound HTTP request. This serializes posts per destination even
    // when previously scheduled actions start late or overlap.
    deliveryLeaseToken: v.optional(v.string()),
    deliveryLeaseUntil: v.optional(v.number()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    // Removal is two-phase: hide/disable immediately, then delete the Vault
    // object before hard-deleting this recovery pointer.
    deletedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
    .index("by_organization_and_deleted_at", ["organizationId", "deletedAt"])
    .index("by_deleted_at", ["deletedAt"]),

  // Recovery pointers created immediately after a notification URL enters
  // WorkOS Vault and removed atomically with the orgWebhooks insert. If the
  // insert fails, the hourly GC can still find and destroy the orphaned object.
  webhookVaultCleanup: defineTable({
    vaultRef: v.string(),
    createdAt: v.number(),
    // Set before the first DELETE and never cleared. The timestamp may rotate
    // after a stale worker lease, but webhook activation forever refuses any
    // claimed pointer because a timed-out DELETE may already have committed.
    claimedAt: v.optional(v.number()),
  }).index("by_created_at", ["createdAt"]),

  // A scheduler rejection must not drop a notification. enqueue writes one
  // of these rows only when runAfter rejects; the minute recovery job retries
  // scheduling and removes the row atomically with a successful schedule.
  webhookDeliveryFallbacks: defineTable({
    webhookId: v.id("orgWebhooks"),
    text: v.string(),
    attempt: v.number(),
    generation: v.number(),
    notBefore: v.number(),
    createdAt: v.number(),
  }).index("by_not_before", ["notBefore"]),

  // Recovery pointer for the first audit -> fanout scheduling hop. Without
  // this, a runAfter rejection before notify.prepare would lose the entire
  // notification even though the audit event committed successfully.
  webhookNotificationFallbacks: defineTable({
    auditLogId: v.id("auditLogs"),
    createdAt: v.number(),
  }).index("by_created_at", ["createdAt"]),

  // ==========================================
  // INVITATIONS
  // ==========================================
  invitations: defineTable({
    // Email of the invited user
    email: v.string(),
    // Organization they're invited to
    organizationId: v.id("organizations"),
    // Role slug they'll receive upon accepting (validated against the
    // registry at create time)
    role: v.string(),
    // Optional: projects to assign the invited user to upon acceptance
    projectIds: v.optional(v.array(v.id("projects"))),
    // Optional: environment scope applied to the created assignments
    // (developers only; e.g. ["development", "staging"])
    environments: v.optional(v.array(v.string())),
    // LEGACY: project-level role — ignored by the unified role model
    projectRole: v.optional(
      v.union(v.literal("viewer"), v.literal("developer"), v.literal("manager"))
    ),
    // Unique invitation token
    token: v.string(),
    // User who sent the invitation
    invitedBy: v.id("users"),
    // Invitation status
    status: v.union(
      v.literal("pending"),
      v.literal("accepted"),
      v.literal("declined"),
      v.literal("expired")
    ),
    // When the invitation expires
    expiresAt: v.number(),
    // Timestamps
    createdAt: v.number(),
    // When the invitation was accepted/declined
    respondedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_organization", ["organizationId"])
    .index("by_token", ["token"])
    .index("by_status", ["status"])
    // Bounds the 6-hourly expired-invitation cleanup cron to actually-expired
    // rows instead of collecting every pending invite on every run
    .index("by_status_and_expires", ["status", "expiresAt"]),

  // ==========================================
  // FEATURE REQUESTS (Wishlist)
  // ==========================================
  featureRequests: defineTable({
    // Feature title
    title: v.string(),
    // Detailed description
    description: v.string(),
    // Submitter's email (for anonymous/public submissions)
    submitterEmail: v.optional(v.string()),
    // Submitter's name (optional)
    submitterName: v.optional(v.string()),
    // Associated user ID (if logged in)
    userId: v.optional(v.id("users")),
    // Feature status
    status: v.union(
      v.literal("submitted"), // New submission
      v.literal("under_review"), // Being considered
      v.literal("planned"), // Accepted for development
      v.literal("in_progress"), // Currently being built
      v.literal("completed"), // Shipped
      v.literal("declined") // Not accepted
    ),
    // Category for organization
    category: v.optional(v.string()),
    // Admin notes (internal)
    adminNotes: v.optional(v.string()),
    // Cached vote count (for efficient sorting)
    voteCount: v.number(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_vote_count", ["voteCount"])
    .index("by_created_at", ["createdAt"])
    .index("by_user", ["userId"])
    .index("by_category", ["category"]),

  // ==========================================
  // FEATURE VOTES
  // ==========================================
  featureVotes: defineTable({
    // Reference to the feature request
    featureRequestId: v.id("featureRequests"),
    // Voter identification (either user ID or email for anonymous)
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
    // Voter's IP hash (for rate limiting anonymous votes)
    ipHash: v.optional(v.string()),
    // Timestamp
    createdAt: v.number(),
  })
    .index("by_feature_request", ["featureRequestId"])
    .index("by_user", ["userId"])
    .index("by_voter_email", ["voterEmail"])
    .index("by_feature_and_user", ["featureRequestId", "userId"])
    .index("by_feature_and_email", ["featureRequestId", "voterEmail"]),

  // ==========================================
  // CHANGELOG ENTRIES
  // ==========================================
  changelog: defineTable({
    // Entry title
    title: v.string(),
    // Markdown content describing the changes
    content: v.string(),
    // Version tag (e.g., "v1.0.0", "v1.2.3")
    version: v.string(),
    // Type of change (primary — kept for backward compat)
    type: v.union(
      v.literal("feature"), // New feature
      v.literal("fix"), // Bug fix
      v.literal("improvement"), // Enhancement/improvement
      v.literal("security"), // Security update
      v.literal("breaking") // Breaking change
    ),
    // Multiple change types (e.g., ["feature", "security"])
    types: v.optional(
      v.array(
        v.union(
          v.literal("feature"),
          v.literal("fix"),
          v.literal("improvement"),
          v.literal("security"),
          v.literal("breaking")
        )
      )
    ),
    // Whether the entry is published and visible
    isPublished: v.boolean(),
    // Publication date (when made public)
    publishedAt: v.optional(v.number()),
    // Scheduled publish timestamp (future date for auto-publish)
    scheduledFor: v.optional(v.number()),
    // Publish status: "draft" | "scheduled" | "published"
    publishStatus: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_published", ["isPublished"])
    .index("by_published_at", ["publishedAt"])
    .index("by_version", ["version"])
    .index("by_type", ["type"])
    .index("by_publish_status", ["publishStatus"]),

  // ==========================================
  // AUDIT LOGS
  // ==========================================
  auditLogs: defineTable({
    // Organization context
    organizationId: v.id("organizations"),
    // Optional project context
    projectId: v.optional(v.id("projects")),
    // Optional variable context
    variableId: v.optional(v.id("environmentVariables")),
    // User who performed the action
    userId: v.id("users"),
    // Type of action performed
    action: v.union(
      // Organization actions
      v.literal("org.created"),
      v.literal("org.updated"),
      v.literal("org.deleted"),
      v.literal("org.member_added"),
      v.literal("org.member_removed"),
      v.literal("org.member_role_changed"),
      v.literal("org.member_suspended"),
      v.literal("org.member_reinstated"),
      v.literal("org.transferred"),
      // Project actions
      v.literal("project.created"),
      v.literal("project.updated"),
      v.literal("project.deleted"),
      v.literal("project.member_added"),
      v.literal("project.member_removed"),
      v.literal("project.member_role_changed"),
      v.literal("project.member_environments_changed"),
      v.literal("project.moved"),
      v.literal("project.restored"),
      v.literal("project.trash_emptied"),
      v.literal("project.favorited"),
      v.literal("project.unfavorited"),
      // Variable actions
      v.literal("variable.created"),
      v.literal("variable.updated"),
      v.literal("variable.deleted"),
      v.literal("variable.accessed"),
      v.literal("variable.exported"),
      v.literal("variable.copied"),
      v.literal("variable.bulk_imported"),
      v.literal("variable.rollback"),
      v.literal("variable.restored"),
      v.literal("variable.requested"),
      v.literal("variable.request_approved"),
      v.literal("variable.request_rejected"),
      v.literal("variable.request_canceled"),
      // Variable rotation actions
      v.literal("variable.rotated"),
      v.literal("variable.expired"),
      v.literal("variable.rotation_reminder_sent"),
      // Permission actions
      v.literal("permission.granted"),
      v.literal("permission.revoked"),
      v.literal("permission.updated"),
      v.literal("permission.expired"),
      v.literal("permission.bulk_granted"),
      v.literal("permission.bulk_revoked"),
      // Access denied/security actions
      v.literal("security.access_denied"),
      v.literal("security.unauthorized_attempt"),
      v.literal("security.permission_check_failed"),
      v.literal("security.token_validation_failed"),
      v.literal("security.rate_limit_exceeded"),
      v.literal("security.suspicious_activity"),
      // Invitation actions
      v.literal("invitation.sent"),
      v.literal("invitation.accepted"),
      v.literal("invitation.declined"),
      v.literal("invitation.expired"),
      v.literal("invitation.resent"),
      v.literal("invitation.canceled"),
      // Access actions
      v.literal("access.token_created"),
      v.literal("access.token_revoked"),
      v.literal("access.token_refreshed"),
      v.literal("access.token_used"),
      v.literal("access.extension_linked"),
      v.literal("access.extension_unlinked"),
      v.literal("access.extension_unsync"),
      // Billing actions
      v.literal("billing.subscription_created"),
      v.literal("billing.subscription_updated"),
      v.literal("billing.subscription_canceled"),
      v.literal("billing.payment_succeeded"),
      v.literal("billing.payment_failed"),
      v.literal("billing.tier_upgraded"),
      v.literal("billing.tier_downgraded"),
      // CI/CD service token actions
      v.literal("cicd.token_created"),
      v.literal("cicd.token_revoked"),
      v.literal("cicd.secrets_pulled"),
      v.literal("cicd.pull_denied"),
      // Public API key actions (generalized token platform)
      v.literal("api.key_created"),
      v.literal("api.key_revoked"),
      v.literal("api.secrets_pulled"),
      v.literal("api.request_denied"),
      // Audit log actions (meta)
      v.literal("audit.exported"),
      v.literal("audit.viewed"),
      // System-level admin actions
      v.literal("system.enforcement_toggled"),
      v.literal("system.setting_changed"),
      // Secret sharing actions
      v.literal("share.created"),
      v.literal("share.viewed"),
      v.literal("share.burned"),
      v.literal("share.expired"),
      v.literal("share.revoked"),
      v.literal("share.otp_sent"),
      v.literal("share.otp_failed"),
      // Tag actions
      v.literal("tag.created"),
      v.literal("tag.updated"),
      v.literal("tag.deleted"),
      // Template actions
      v.literal("template.created"),
      v.literal("template.updated"),
      v.literal("template.deleted"),
      // Shared account actions
      v.literal("account.created"),
      v.literal("account.updated"),
      v.literal("account.deleted"),
      v.literal("account.accessed"),
      v.literal("account.permission_granted"),
      v.literal("account.permission_revoked"),
      v.literal("account.permission_updated"),
      // Secret file actions
      v.literal("file.created"),
      v.literal("file.updated"),
      v.literal("file.deleted"),
      v.literal("file.restored"),
      v.literal("file.downloaded"),
      v.literal("file.permission_granted"),
      v.literal("file.permission_revoked"),
      v.literal("file.permission_updated"),
      // Notification webhook (Slack/Discord) actions
      v.literal("integration.webhook_created"),
      v.literal("integration.webhook_updated"),
      v.literal("integration.webhook_deleted"),
      // Project documentation actions
      v.literal("doc.created"),
      v.literal("doc.updated"),
      v.literal("doc.published"),
      v.literal("doc.deleted"),
      v.literal("doc.restored"),
      // Documentation sharing. `doc.share_viewed` is attributed to the share
      // CREATOR: an external reader has no user row, and userId is required.
      // The viewer's context travels in `details`, matching share.viewed.
      v.literal("doc.shared"),
      v.literal("doc.share_revoked"),
      v.literal("doc.share_viewed")
    ),
    // Additional details about the action (JSON)
    details: v.optional(v.string()),
    // IP address of the request (for security)
    ipAddress: v.optional(v.string()),
    // User agent string
    userAgent: v.optional(v.string()),
    // Severity level for filtering/alerting
    severity: v.optional(
      v.union(
        v.literal("info"),
        v.literal("warning"),
        v.literal("error"),
        v.literal("critical")
      )
    ),
    // Resource type for easier filtering
    resourceType: v.optional(
      v.union(
        v.literal("organization"),
        v.literal("project"),
        v.literal("variable"),
        v.literal("permission"),
        v.literal("access_token"),
        v.literal("invitation"),
        v.literal("billing"),
        v.literal("security"),
        v.literal("account"),
        v.literal("file"),
        v.literal("doc")
      )
    ),
    // Whether this action involved sensitive data
    involvesSensitiveData: v.optional(v.boolean()),
    // Session ID for correlating related actions
    sessionId: v.optional(v.string()),
    // Request ID for tracing
    requestId: v.optional(v.string()),
    // Geographic information (derived from IP)
    geoLocation: v.optional(v.string()),
    // Timestamp
    createdAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_project", ["projectId"])
    .index("by_variable", ["variableId"])
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_org_and_created", ["organizationId", "createdAt"])
    .index("by_org_and_action", ["organizationId", "action"])
    .index("by_org_and_severity", ["organizationId", "severity"])
    .index("by_severity", ["severity"])
    .index("by_resource_type", ["resourceType"])
    .index("by_session", ["sessionId"])
    .index("by_user_and_created", ["userId", "createdAt"]),

  // ==========================================
  // USER TIERS (Replaces organizationTiers)
  // Tier assignment is per-USER. The org owner's tier
  // determines what all their owned organizations get.
  // ==========================================
  userTiers: defineTable({
    // Reference to the user
    userId: v.id("users"),
    // Subscription tier name (matches tierDefinitions.name)
    tier: v.string(),
    // Last updated timestamp
    updatedAt: v.number(),
    // Who triggered the change (user or system)
    updatedBy: v.optional(v.id("users")),
    // Reason for the tier change
    reason: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // ==========================================
  // FEATURE REGISTRY (Developer-seeded feature definitions)
  // Defines every gatable feature in the system.
  // Features are added via seed functions, NOT via admin UI.
  // ==========================================
  featureRegistry: defineTable({
    // Unique machine key (e.g., "max_projects", "bulk_import", "cli_access")
    key: v.string(),
    // Human-readable name for admin UI
    displayName: v.string(),
    // Optional longer description
    description: v.optional(v.string()),
    // Feature value type
    valueType: v.union(
      v.literal("boolean"), // enabled/disabled
      v.literal("numeric") // number or null (unlimited)
    ),
    // Category for admin UI grouping (e.g., "Resources", "Tools", "Security")
    category: v.string(),
    // Default value when no tier-specific override exists
    // Stored as JSON string: "true", "false", "50", "null" (null = unlimited)
    defaultValue: v.string(),
    // Whether usage resets on billing cycle (consumption counter vs persistent resource)
    resettable: v.boolean(),
    // Sort order within category for UI display
    sortOrder: v.number(),
    // Whether this feature is currently active in the registry
    isActive: v.boolean(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  // ==========================================
  // TIER FEATURES (Per-tier value overrides)
  // Maps each tier to its configured value for each feature.
  // Managed by admin via the tier configuration UI.
  // ==========================================
  tierFeatures: defineTable({
    // Tier name (matches tierDefinitions.name)
    tierName: v.string(),
    // Feature key (matches featureRegistry.key)
    featureKey: v.string(),
    // The value for this tier. JSON string: "true", "false", "50", "null"
    value: v.string(),
    // Timestamp
    updatedAt: v.number(),
  })
    .index("by_tier", ["tierName"])
    .index("by_feature", ["featureKey"])
    .index("by_tier_and_feature", ["tierName", "featureKey"]),

  // ==========================================
  // USAGE COUNTERS (Consumption-based metrics per user)
  // DEAD — never inserted into anywhere; consumption tracking was never wired up.
  // All code references removed; table declaration retained only so a potential
  // stray row still validates. The `cleanup-dead-data` migration in admin.ts
  // deletes any rows; drop this defineTable in a later PR once confirmed empty.
  // ==========================================
  usageCounters: defineTable({
    // Reference to the user
    userId: v.id("users"),
    // Feature key (matches featureRegistry.key)
    featureKey: v.string(),
    // Current consumption count
    count: v.number(),
    // Billing period boundaries
    periodStart: v.number(),
    periodEnd: v.number(),
    // When last reset occurred
    resetAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_feature", ["userId", "featureKey"]),

  // ==========================================
  // SUBSCRIPTION GRACE PERIODS
  // Tracks grace periods after subscription cancellation.
  // During grace period, user retains their previous tier.
  // After expiry, downgraded to default (free) tier.
  // ==========================================
  subscriptionGracePeriods: defineTable({
    // Reference to the user
    userId: v.id("users"),
    // Tier the user had before subscription expired
    previousTier: v.string(),
    // When the grace period ends
    gracePeriodEnd: v.number(),
    // Timestamps
    createdAt: v.number(),
    // Whether this grace period is currently active
    isActive: v.boolean(),
  })
    .index("by_user", ["userId"])
    // Bounds the hourly grace-period expiry cron to periods whose end has
    // actually passed instead of collecting every active grace period
    // (prefix-covers any plain isActive-equality query)
    .index("by_active_and_end", ["isActive", "gracePeriodEnd"]),

  // ==========================================
  // SUBSCRIPTIONS (Polar.sh Integration)
  // ==========================================
  subscriptions: defineTable({
    // Legacy reference, kept for backward compat queries
    organizationId: v.id("organizations"),
    // Reference to the user (billing is per-user, optional until migration backfills)
    userId: v.optional(v.id("users")),
    // Polar customer ID
    polarCustomerId: v.string(),
    // Polar subscription ID
    polarSubscriptionId: v.string(),
    // Polar product ID for the subscription
    polarProductId: v.string(),
    // Subscription status from Polar
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("past_due"),
      v.literal("trialing"),
      v.literal("unpaid"),
      v.literal("revoked")
    ),
    // Billing period
    currentPeriodStart: v.number(),
    currentPeriodEnd: v.number(),
    // When the subscription will be canceled (if scheduled)
    cancelAtPeriodEnd: v.boolean(),
    cancelAt: v.optional(v.number()),
    // Trial information
    trialStart: v.optional(v.number()),
    trialEnd: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_polar_customer", ["polarCustomerId"])
    .index("by_polar_subscription", ["polarSubscriptionId"])
    .index("by_status", ["status"]),

  // ==========================================
  // POLAR CUSTOMERS (Maps users to Polar.sh)
  // ==========================================
  polarCustomers: defineTable({
    // Legacy reference, kept for backward compat queries
    organizationId: v.id("organizations"),
    // Reference to the user (billing is per-user, optional until migration backfills)
    userId: v.optional(v.id("users")),
    // Polar customer ID
    polarCustomerId: v.string(),
    // Email used for Polar
    email: v.string(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_polar_customer", ["polarCustomerId"]),

  // ==========================================
  // PENDING EXTENSION AUTH SESSIONS
  // Short-lived (10 min) handshake records used during the VS Code
  // extension OAuth flow. Must live in the DB (not in-memory) because
  // serverless functions don't share memory — the callback and polling
  // check endpoints can hit different Lambda instances.
  // ==========================================
  // ==========================================
  // CLI TOKENS (device-session display/revoke records)
  //
  // Since the WorkOS device-flow cutover (Stage 2) this table is the single
  // device-session record for BOTH the CLI and the VS Code extension. It backs
  // the active-sessions UI + remote sign-out only; identity is the WorkOS JWT.
  // The old `cliSessions` (browser-to-CLI handshake) and
  // `pendingExtensionAuthSessions` (extension handshake) tables were removed in
  // that cutover — the device flow replaces both handshakes.
  // ==========================================
  cliTokens: defineTable({
    // User who owns this token
    userId: v.id("users"),
    // Organization this token was issued for (optional/additive — legacy rows
    // predate this field and leave it unset). When present it lets session
    // revocation be scoped to a single org instead of sweeping the user's
    // tokens across every org they belong to. Never backfilled or required.
    organizationId: v.optional(v.id("organizations")),
    // Since the WorkOS device-flow cutover (Stage 2) this row is a DISPLAY /
    // REVOKE record only — the JWT is NEVER stored server-side. accessToken /
    // refreshToken are optional legacy holdovers (old homegrown bearer rows
    // set them; new device-session rows leave them unset).
    accessToken: v.optional(v.string()),
    // The refresh token (legacy; unset on device-session rows)
    refreshToken: v.optional(v.string()),
    // WorkOS session id (JWT `sid` claim) — enables real remote sign-out by
    // calling workos.userManagement.revokeSession({ sessionId }) on revoke.
    sessionId: v.optional(v.string()),
    // Which client surface this device-session belongs to.
    clientType: v.optional(v.union(v.literal("cli"), v.literal("extension"))),
    // Device name for identification
    deviceName: v.optional(v.string()),
    // Device ID (for unique identification)
    deviceId: v.optional(v.string()),
    // Last used timestamp
    lastUsedAt: v.optional(v.number()),
    // Token expiration
    expiresAt: v.number(),
    // Whether token is active
    isActive: v.boolean(),
    // Timestamps
    createdAt: v.number(),
    // When revoked (if applicable)
    revokedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_access_token", ["accessToken"])
    .index("by_refresh_token", ["refreshToken"])
    .index("by_device_id", ["deviceId"])
    .index("by_user_active", ["userId", "isActive"])
    .index("by_org_and_user", ["organizationId", "userId"]),

  // ==========================================
  // ENVIRONMENT TEMPLATES
  // ==========================================
  environmentTemplates: defineTable({
    // Template display name
    name: v.string(),
    // Brief description of what this template is for
    description: v.string(),
    // The project type this template is designed for
    projectType: v.string(),
    // Icon for visual identification (emoji)
    icon: v.string(),
    // Color for visual identification (hex code)
    color: v.string(),
    // Framework/library version this template is designed for
    version: v.optional(v.string()),
    // Tags for searchability
    tags: v.array(v.string()),
    // Whether this is a built-in template (not user-created)
    isBuiltIn: v.boolean(),
    // Organization that owns this template (null for built-in)
    organizationId: v.optional(v.id("organizations")),
    // User who created the template (null for built-in)
    createdBy: v.optional(v.id("users")),
    // Whether the template is published and visible to others
    isPublished: v.boolean(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_project_type", ["projectType"])
    .index("by_organization", ["organizationId"])
    .index("by_created_by", ["createdBy"])
    .index("by_is_built_in", ["isBuiltIn"])
    .index("by_is_published", ["isPublished"]),

  // ==========================================
  // TEMPLATE VARIABLES
  // ==========================================
  templateVariables: defineTable({
    // Reference to the parent template
    templateId: v.id("environmentTemplates"),
    // The variable key (e.g., "DATABASE_URL")
    key: v.string(),
    // Human-readable description of the variable
    description: v.string(),
    // Default/example value for reference
    defaultValue: v.optional(v.string()),
    // Placeholder text showing expected format
    placeholder: v.optional(v.string()),
    // Which environments this variable applies to
    environments: v.array(v.string()),
    // Whether this variable contains sensitive data
    isSensitive: v.boolean(),
    // Whether this variable is required for the project to function
    isRequired: v.boolean(),
    // Category for grouping related variables
    category: v.string(),
    // Display order within the template
    order: v.number(),
  })
    .index("by_template", ["templateId"])
    .index("by_template_and_key", ["templateId", "key"])
    .index("by_category", ["category"]),

  // ==========================================
  // PERMISSION REVOCATION EVENTS
  // Used for real-time sync with VS Code extension
  // ==========================================
  permissionRevocationEvents: defineTable({
    // The access token that was revoked
    accessToken: v.string(),
    // Reference to the project
    projectId: v.id("projects"),
    // Reference to the user whose access was revoked
    userId: v.id("users"),
    // Reason for revocation
    reason: v.string(),
    // Who triggered the revocation
    revokedBy: v.id("users"),
    // When the revocation occurred
    revokedAt: v.number(),
    // Whether this event has been acknowledged by the client
    acknowledged: v.boolean(),
    // When the event was acknowledged (if applicable)
    acknowledgedAt: v.optional(v.number()),
    // TTL - events should be cleaned up after being acknowledged or expired
    expiresAt: v.number(),
  })
    .index("by_access_token", ["accessToken"])
    .index("by_project", ["projectId"])
    .index("by_user", ["userId"])
    // Bounds the hourly ack-cleanup cron to rows old enough to delete,
    // instead of collecting every acknowledged row on every run (also
    // prefix-covers any plain acknowledged-equality query)
    .index("by_acknowledged_and_ack_at", ["acknowledged", "acknowledgedAt"])
    .index("by_expires_at", ["expiresAt"]),

  // ==========================================
  // SUPPORT TICKETS
  // ==========================================
  supportTickets: defineTable({
    // Submitter information
    name: v.string(),
    email: v.string(),
    // Support category
    category: v.union(
      v.literal("bug"),
      v.literal("account"),
      v.literal("billing"),
      v.literal("cli"),
      v.literal("extension"),
      v.literal("other")
    ),
    // Ticket subject
    subject: v.string(),
    // Detailed description of the issue
    message: v.string(),
    // Ticket priority
    priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    // Ticket status
    status: v.union(
      v.literal("open"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("closed")
    ),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_status", ["status"])
    .index("by_category", ["category"])
    .index("by_created_at", ["createdAt"]),

  // ==========================================
  // CONTACT MESSAGES
  // ==========================================
  contactMessages: defineTable({
    // Sender information
    name: v.string(),
    email: v.string(),
    // Message subject
    subject: v.string(),
    // Message body
    message: v.string(),
    // Whether the message has been read
    isRead: v.boolean(),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_email", ["email"])
    .index("by_is_read", ["isRead"])
    .index("by_created_at", ["createdAt"]),

  // ==========================================
  // SHARED SECRETS (Time-Limited Secure Sharing)
  // ==========================================
  sharedSecrets: defineTable({
    // Unique lookup token (shr_ prefix + 64 hex chars)
    token: v.string(),
    // WorkOS Vault reference holding the client-encrypted ciphertext
    vaultRef: v.string(),
    // Which kind of resource this share points at. Absent ⇒ "variable"
    // (legacy rows created before shared accounts). Normalize on read.
    resourceType: v.optional(
      v.union(v.literal("variable"), v.literal("account"))
    ),
    // Source variable (for audit trail only — NOT used to re-fetch the value).
    // Optional now that a share may instead reference a project account.
    variableId: v.optional(v.id("environmentVariables")),
    // Source account (for account shares — audit trail only)
    accountId: v.optional(v.id("projectAccounts")),
    // Display label for the shared resource (variable key OR account name).
    // NOT the value. Required for both resource types.
    variableKey: v.string(),
    // Organization context (for audit logging and feature gating)
    organizationId: v.id("organizations"),
    // Project context (for audit logging)
    projectId: v.id("projects"),
    // User who created the share
    createdBy: v.id("users"),
    // Share mode
    mode: v.union(v.literal("one_time"), v.literal("time_limited")),
    // When the share expires (absolute timestamp)
    expiresAt: v.number(),
    // Whether passphrase protection is enabled (passphrase NOT stored server-side)
    hasPassphrase: v.boolean(),
    // Authorized recipient emails
    recipientEmails: v.array(v.string()),
    // Share lifecycle status
    status: v.union(
      v.literal("active"),
      v.literal("burned"), // one-time: viewed
      v.literal("expired"), // TTL elapsed
      v.literal("revoked") // manually revoked by creator
    ),
    // Total views across all recipients
    totalViewCount: v.number(),
    // Lifecycle timestamps
    createdAt: v.number(),
    burnedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(v.id("users")),
  })
    .index("by_token", ["token"])
    .index("by_variable", ["variableId"])
    .index("by_account", ["accountId"])
    .index("by_organization", ["organizationId"])
    .index("by_created_by", ["createdBy"])
    .index("by_status_and_expires", ["status", "expiresAt"])
    .index("by_project", ["projectId"]),

  // ==========================================
  // SHARE RECIPIENTS (Per-recipient tracking + OTP state)
  // ==========================================
  shareRecipients: defineTable({
    // Reference to the parent shared secret
    shareId: v.id("sharedSecrets"),
    // Recipient email (lowercase, trimmed)
    email: v.string(),
    // OTP state
    otpCode: v.optional(v.string()), // SHA-256 hashed 6-digit code
    otpExpiresAt: v.optional(v.number()), // 5-minute TTL
    otpAttempts: v.number(), // max 5 attempts before lockout
    otpVerified: v.boolean(), // true once OTP confirmed
    // View state
    hasViewed: v.boolean(),
    viewedAt: v.optional(v.number()),
    viewerIpAddress: v.optional(v.string()),
    viewerUserAgent: v.optional(v.string()),
    // Email delivery
    emailSentAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
  })
    .index("by_share", ["shareId"])
    .index("by_share_and_email", ["shareId", "email"])
    .index("by_email", ["email"])
    // Bounds the every-30-min OTP cleanup cron to expired rows only
    .index("by_otp_expires", ["otpExpiresAt"]),

  // ==========================================
  // ADMIN SETTINGS (Platform-wide configuration)
  // ==========================================
  adminSettings: defineTable({
    // Setting key (e.g., "tierEnforcement")
    key: v.string(),
    // Setting value (JSON string for flexibility)
    value: v.string(),
    // Last updated timestamp
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  // ==========================================
  // TIER DEFINITIONS (Dynamic, admin-managed tiers)
  // ==========================================
  // DEPRECATED / DRAIN-ONLY: no code inserts or patches this table anymore; the
  // only remaining readers are the one-shot `migrate-phase6` handler in admin.ts
  // (organizationTiers -> userTiers). Will be removed after that migration has
  // cleared remaining records in every environment.
  organizationTiers: defineTable({
    organizationId: v.id("organizations"),
    tier: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  }).index("by_organization", ["organizationId"]),

  tierDefinitions: defineTable({
    // Unique tier identifier (e.g., "free", "pro", "enterprise")
    name: v.string(),
    // Human-readable display name
    displayName: v.string(),
    // Optional description
    description: v.optional(v.string()),
    // Sort order for UI display
    sortOrder: v.number(),
    // Whether this is the default tier for new organizations
    isDefault: v.boolean(),
    // Badge color (hex code)
    color: v.optional(v.string()),
    // Polar product ID for this tier (for multi-tier billing)
    polarProductId: v.optional(v.string()),
    // Pricing & marketing fields for the public pricing page
    monthlyPrice: v.optional(v.number()),
    yearlyPrice: v.optional(v.number()),
    badge: v.optional(v.string()),
    badgeColor: v.optional(v.string()),
    ctaText: v.optional(v.string()),
    ctaLink: v.optional(v.string()),
    isComingSoon: v.optional(v.boolean()),
    highlightFeatures: v.optional(v.array(v.string())),
    // DEPRECATED: These will be stripped by migration, then removed from schema.
    dynamicFeatures: v.optional(v.any()),
    limits: v.optional(
      v.object({
        maxProjects: v.union(v.number(), v.null()),
        maxVariablesPerProject: v.union(v.number(), v.null()),
        maxTeamMembers: v.union(v.number(), v.null()),
        maxOrganizations: v.union(v.number(), v.null()),
        auditLogRetentionDays: v.number(),
      })
    ),
    features: v.optional(
      v.object({
        apiAccessEnabled: v.boolean(),
        extensionAccessEnabled: v.boolean(),
        granularPermissionsEnabled: v.boolean(),
        variableVersionHistoryEnabled: v.boolean(),
        bulkImportEnabled: v.boolean(),
        prioritySupport: v.optional(v.boolean()),
        customBranding: v.optional(v.boolean()),
        ssoEnabled: v.optional(v.boolean()),
        secretRotationEnabled: v.optional(v.boolean()),
      })
    ),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    // Point-reads the default tier (getDefaultTierName) instead of collecting
    // the whole table on every free-user tier resolution
    .index("by_default", ["isDefault"]),

  // ==========================================
  // PROCESSED WEBHOOK EVENTS (Deduplication)
  // ==========================================
  processedWebhookEvents: defineTable({
    // The webhook event ID (from webhook-id header)
    webhookId: v.string(),
    // Event type for debugging
    eventType: v.string(),
    // When the event was processed
    processedAt: v.number(),
  })
    .index("by_webhook_id", ["webhookId"])
    // Bounds the 6-hourly processed-webhook cleanup cron to old rows only
    .index("by_processed_at", ["processedAt"]),

  // ==========================================
  // PAYMENT PRODUCTS (Provider-agnostic product mapping)
  // ==========================================
  paymentProducts: defineTable({
    // The tier this product maps to (e.g., "free", "pro")
    tierName: v.string(),
    // Payment provider (e.g., "polar", "stripe", "lemonsqueezy")
    provider: v.string(),
    // The product ID in the payment provider's system
    productId: v.string(),
    // Whether this mapping is currently active
    isActive: v.boolean(),
    // Human-readable label for admin UI
    label: v.optional(v.string()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_tier", ["tierName"])
    .index("by_provider", ["provider"])
    .index("by_tier_and_provider", ["tierName", "provider"])
    .index("by_product_id", ["productId"]),
});
