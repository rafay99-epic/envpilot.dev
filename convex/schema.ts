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
    // Subscription tier: "free" or "pro"
    tier: v.union(v.literal("free"), v.literal("pro")),
    // Organization-level settings for access control
    settings: v.optional(
      v.object({
        // Whether team leads can create new projects (default: true)
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
  // ORGANIZATION MEMBERS
  // ==========================================
  organizationMembers: defineTable({
    // Reference to the organization
    organizationId: v.id("organizations"),
    // Reference to the user
    userId: v.id("users"),
    // Role within the organization
    role: v.union(
      v.literal("admin"),
      v.literal("team_lead"),
      v.literal("member")
    ),
    // When the member joined
    joinedAt: v.number(),
    // Who invited them (null if they created the org)
    invitedBy: v.optional(v.id("users")),
  })
    .index("by_organization", ["organizationId"])
    .index("by_user", ["userId"])
    .index("by_org_and_user", ["organizationId", "userId"]),

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
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
    // Soft delete support
    deletedAt: v.optional(v.number()),
  })
    .index("by_organization", ["organizationId"])
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
    // Project-level role
    role: v.union(
      v.literal("viewer"), // Can view variables they have explicit permission to
      v.literal("developer"), // Can view all variables, create/edit variables
      v.literal("manager") // Can also manage project members
    ),
    // Who added this member to the project
    addedBy: v.id("users"),
    // When the member was added
    addedAt: v.number(),
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
  })
    .index("by_project", ["projectId"])
    .index("by_project_and_key", ["projectId", "key"])
    .index("by_project_and_environments", ["projectId", "environments"]),

  // ==========================================
  // ENVIRONMENT VARIABLE REQUESTS
  // ==========================================
  environmentVariableRequests: defineTable({
    // The requested variable key (e.g., "DATABASE_URL")
    key: v.string(),
    // Encrypted value reference proposed by the requester
    vaultRef: v.string(),
    // Optional human-readable description
    description: v.optional(v.string()),
    // Environment tags (e.g., ["development", "staging", "production"])
    environments: v.array(v.string()),
    // Parent project
    projectId: v.id("projects"),
    // Parent organization (denormalized for easier querying)
    organizationId: v.id("organizations"),
    // Whether this is sensitive/secret
    isSensitive: v.boolean(),
    // User who requested this variable
    requestedBy: v.id("users"),
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
    .index("by_project_and_key", ["projectId", "key"]),

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
    .index("by_variable_and_version", ["variableId", "version"]),

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
    .index("by_user_active", ["userId", "isActive"]),

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
  // INVITATIONS
  // ==========================================
  invitations: defineTable({
    // Email of the invited user
    email: v.string(),
    // Organization they're invited to
    organizationId: v.id("organizations"),
    // Role they'll receive upon accepting
    role: v.union(
      v.literal("admin"),
      v.literal("team_lead"),
      v.literal("member")
    ),
    // Optional: projects to assign the invited user to upon acceptance
    projectIds: v.optional(v.array(v.id("projects"))),
    // Optional: project-level role for the assigned projects
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
    .index("by_status", ["status"]),

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
    // Type of change
    type: v.union(
      v.literal("feature"), // New feature
      v.literal("fix"), // Bug fix
      v.literal("improvement"), // Enhancement/improvement
      v.literal("security"), // Security update
      v.literal("breaking") // Breaking change
    ),
    // Whether the entry is published and visible
    isPublished: v.boolean(),
    // Publication date (when made public)
    publishedAt: v.optional(v.number()),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_published", ["isPublished"])
    .index("by_published_at", ["publishedAt"])
    .index("by_version", ["version"])
    .index("by_type", ["type"]),

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
      v.literal("org.transferred"),
      // Project actions
      v.literal("project.created"),
      v.literal("project.updated"),
      v.literal("project.deleted"),
      v.literal("project.member_added"),
      v.literal("project.member_removed"),
      v.literal("project.member_role_changed"),
      v.literal("project.moved"),
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
      // Access actions
      v.literal("access.token_created"),
      v.literal("access.token_revoked"),
      v.literal("access.token_refreshed"),
      v.literal("access.token_used"),
      v.literal("access.extension_linked"),
      v.literal("access.extension_unlinked"),
      // Billing actions
      v.literal("billing.subscription_created"),
      v.literal("billing.subscription_updated"),
      v.literal("billing.subscription_canceled"),
      v.literal("billing.payment_succeeded"),
      v.literal("billing.payment_failed"),
      v.literal("billing.tier_upgraded"),
      v.literal("billing.tier_downgraded"),
      // Audit log actions (meta)
      v.literal("audit.exported"),
      v.literal("audit.viewed")
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
        v.literal("security")
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
    .index("by_session", ["sessionId"]),

  // ==========================================
  // SUBSCRIPTIONS (Stripe Integration)
  // ==========================================
  subscriptions: defineTable({
    // Reference to the organization
    organizationId: v.id("organizations"),
    // Stripe customer ID
    stripeCustomerId: v.string(),
    // Stripe subscription ID
    stripeSubscriptionId: v.string(),
    // Stripe price ID for the subscription
    stripePriceId: v.string(),
    // Subscription status from Stripe
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("incomplete_expired"),
      v.literal("past_due"),
      v.literal("paused"),
      v.literal("trialing"),
      v.literal("unpaid")
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
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"])
    .index("by_status", ["status"]),

  // ==========================================
  // STRIPE CUSTOMERS (Maps organizations to Stripe)
  // ==========================================
  stripeCustomers: defineTable({
    // Reference to the organization
    organizationId: v.id("organizations"),
    // Stripe customer ID
    stripeCustomerId: v.string(),
    // Email used for Stripe
    email: v.string(),
    // Timestamps
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organization", ["organizationId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),

  // ==========================================
  // CLI SESSIONS (Browser-to-CLI Authentication)
  // ==========================================
  cliSessions: defineTable({
    // Unique authentication code (displayed to user)
    code: v.string(),
    // User who authenticated (set after successful auth)
    userId: v.optional(v.id("users")),
    // Session status
    status: v.union(
      v.literal("pending"),
      v.literal("authenticated"),
      v.literal("expired")
    ),
    // Access token (generated after authentication)
    accessToken: v.optional(v.string()),
    // Refresh token for token renewal
    refreshToken: v.optional(v.string()),
    // Device name provided by CLI (e.g., "MacBook Pro - Terminal")
    deviceName: v.optional(v.string()),
    // When the session code expires (short-lived for security)
    expiresAt: v.number(),
    // Timestamps
    createdAt: v.number(),
    authenticatedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_status_and_expires", ["status", "expiresAt"])
    .index("by_user", ["userId"])
    .index("by_access_token", ["accessToken"])
    .index("by_refresh_token", ["refreshToken"]),

  // ==========================================
  // CLI TOKENS (Active CLI Authentications)
  // ==========================================
  cliTokens: defineTable({
    // User who owns this token
    userId: v.id("users"),
    // The access token
    accessToken: v.string(),
    // The refresh token
    refreshToken: v.string(),
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
    .index("by_user_active", ["userId", "isActive"]),

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
    .index("by_acknowledged", ["acknowledged"])
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
});
