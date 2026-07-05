import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { normalizeOrgRole } from "./authz";

/**
 * Feature Requests (Wishlist) Queries and Mutations
 * Public-facing feature voting system
 */

// Constants for validation
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 50;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

// ==========================================
// QUERIES
// ==========================================

/**
 * List all public feature requests (sorted by vote count)
 */
export const listPublic = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("submitted"),
        v.literal("under_review"),
        v.literal("planned"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("declined")
      )
    ),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let requests;

    // Apply status filter if provided
    if (args.status) {
      requests = await ctx.db
        .query("featureRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      requests = await ctx.db.query("featureRequests").collect();
    }

    // Filter by category if provided (post-query filtering since we can only use one index)
    let filteredRequests = requests;
    if (args.category) {
      filteredRequests = requests.filter((r) => r.category === args.category);
    }

    // Sort by vote count descending
    return filteredRequests.sort((a, b) => b.voteCount - a.voteCount);
  },
});

/**
 * Get a single feature request by ID
 */
export const getById = query({
  args: { featureRequestId: v.id("featureRequests") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.featureRequestId);
  },
});

/**
 * Get all feature requests with planned/in_progress status (for roadmap view)
 */
export const listPlanned = query({
  args: {},
  handler: async (ctx) => {
    const planned = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "planned"))
      .collect();

    const inProgress = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const completed = await ctx.db
      .query("featureRequests")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .collect();

    return {
      planned: planned.sort((a, b) => b.voteCount - a.voteCount),
      inProgress: inProgress.sort((a, b) => b.voteCount - a.voteCount),
      completed: completed
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 10), // Show last 10 completed
    };
  },
});

/**
 * Check if a user/email has voted for a feature
 */
export const hasVoted = query({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.userId) {
      const vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
        )
        .first();
      return !!vote;
    }

    if (args.voterEmail) {
      const vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", args.voterEmail!)
        )
        .first();
      return !!vote;
    }

    return false;
  },
});

/**
 * Get all unique categories
 */
export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    const requests = await ctx.db.query("featureRequests").collect();
    const categories = new Set<string>();

    for (const request of requests) {
      if (request.category) {
        categories.add(request.category);
      }
    }

    return Array.from(categories).sort();
  },
});

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Submit a new feature request
 */
export const submit = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    submitterEmail: v.optional(v.string()),
    submitterName: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const title = args.title.trim();
    const description = args.description.trim();
    const email = args.submitterEmail?.trim();
    const name = args.submitterName?.trim();
    const category = args.category?.trim();

    // Validate required fields
    if (!title) {
      throw new Error("Title is required");
    }

    if (title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
    }

    if (!description) {
      throw new Error("Description is required");
    }

    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(
        `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
      );
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Validate category length if provided
    if (category && category.length > MAX_CATEGORY_LENGTH) {
      throw new Error(
        `Category must be ${MAX_CATEGORY_LENGTH} characters or less`
      );
    }

    // Create the feature request
    const featureRequestId = await ctx.db.insert("featureRequests", {
      title,
      description,
      submitterEmail: email,
      submitterName: name,
      userId: args.userId,
      status: "submitted",
      category,
      voteCount: 1, // Auto-vote for submitter
      createdAt: now,
      updatedAt: now,
    });

    // Create initial vote from submitter
    if (args.userId || email) {
      await ctx.db.insert("featureVotes", {
        featureRequestId,
        userId: args.userId,
        voterEmail: email,
        createdAt: now,
      });
    }

    return featureRequestId;
  },
});

/**
 * Vote for a feature request
 */
export const vote = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
    ipHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const email = args.voterEmail?.trim();

    // Validate that we have some form of voter identification
    if (!args.userId && !email) {
      throw new Error("User ID or email required to vote");
    }

    // Validate email format if provided
    if (email && !validateEmail(email)) {
      throw new Error("Invalid email format");
    }

    // Check if feature request exists
    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    // If user is logged in, check by userId only (prevent double-identity voting)
    if (args.userId) {
      const existingVote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
        )
        .first();

      if (existingVote) {
        throw new Error("You have already voted for this feature");
      }

      // Create vote with userId only (don't store email for logged-in users)
      await ctx.db.insert("featureVotes", {
        featureRequestId: args.featureRequestId,
        userId: args.userId,
        ipHash: args.ipHash,
        createdAt: now,
      });
    } else if (email) {
      // Anonymous voting - check by email
      const existingVote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", email)
        )
        .first();

      if (existingVote) {
        throw new Error("This email has already voted for this feature");
      }

      // Create vote with email
      await ctx.db.insert("featureVotes", {
        featureRequestId: args.featureRequestId,
        voterEmail: email,
        ipHash: args.ipHash,
        createdAt: now,
      });
    }

    // Update vote count on feature request
    await ctx.db.patch(args.featureRequestId, {
      voteCount: feature.voteCount + 1,
      updatedAt: now,
    });

    return { success: true, newVoteCount: feature.voteCount + 1 };
  },
});

/**
 * Remove vote from a feature request
 */
export const unvote = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.optional(v.id("users")),
    voterEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if feature request exists
    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    let vote = null;

    // Find vote by user ID
    if (args.userId) {
      vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_user", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("userId", args.userId!)
        )
        .first();
    }

    // Find vote by email if not found by user ID
    if (!vote && args.voterEmail) {
      vote = await ctx.db
        .query("featureVotes")
        .withIndex("by_feature_and_email", (q) =>
          q
            .eq("featureRequestId", args.featureRequestId)
            .eq("voterEmail", args.voterEmail!)
        )
        .first();
    }

    if (!vote) {
      throw new Error("Vote not found");
    }

    // Delete the vote
    await ctx.db.delete(vote._id);

    // Update vote count on feature request
    const newVoteCount = Math.max(0, feature.voteCount - 1);
    await ctx.db.patch(args.featureRequestId, {
      voteCount: newVoteCount,
      updatedAt: now,
    });

    return { success: true, newVoteCount };
  },
});

/**
 * Update feature request status (admin only)
 * Requires authenticated user with org-owner privileges
 */
export const updateStatus = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    status: v.union(
      v.literal("submitted"),
      v.literal("under_review"),
      v.literal("planned"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("declined")
    ),
    adminNotes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is an org owner (any organization). After the unified-role
    // migration there are no "admin" rows — owners hold that authority.
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const ownerMembership = memberships.find(
      (m) => normalizeOrgRole(m.role) === "owner"
    );

    if (!ownerMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    await ctx.db.patch(args.featureRequestId, {
      status: args.status,
      adminNotes: args.adminNotes,
      updatedAt: now,
    });

    return args.featureRequestId;
  },
});

/**
 * Update feature request details (admin only)
 * Requires authenticated user with org-owner privileges
 */
export const update = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const { featureRequestId, userId, ...updates } = args;

    // Verify user exists
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is an org owner (any organization). After the unified-role
    // migration there are no "admin" rows — owners hold that authority.
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const ownerMembership = memberships.find(
      (m) => normalizeOrgRole(m.role) === "owner"
    );

    if (!ownerMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    const updateData: Record<string, unknown> = { updatedAt: now };

    // Validate and set title
    if (updates.title !== undefined) {
      const title = updates.title.trim();
      if (title.length > MAX_TITLE_LENGTH) {
        throw new Error(`Title must be ${MAX_TITLE_LENGTH} characters or less`);
      }
      updateData.title = title;
    }

    // Validate and set description
    if (updates.description !== undefined) {
      const description = updates.description.trim();
      if (description.length > MAX_DESCRIPTION_LENGTH) {
        throw new Error(
          `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
        );
      }
      updateData.description = description;
    }

    // Validate and set category
    if (updates.category !== undefined) {
      const category = updates.category.trim();
      if (category.length > MAX_CATEGORY_LENGTH) {
        throw new Error(
          `Category must be ${MAX_CATEGORY_LENGTH} characters or less`
        );
      }
      updateData.category = category;
    }

    if (updates.adminNotes !== undefined) {
      updateData.adminNotes = updates.adminNotes;
    }

    await ctx.db.patch(featureRequestId, updateData);

    return featureRequestId;
  },
});

/**
 * Delete a feature request (admin only)
 * Requires authenticated user with org-owner privileges
 */
export const remove = mutation({
  args: {
    featureRequestId: v.id("featureRequests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Verify user exists
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is an org owner (any organization). After the unified-role
    // migration there are no "admin" rows — owners hold that authority.
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const ownerMembership = memberships.find(
      (m) => normalizeOrgRole(m.role) === "owner"
    );

    if (!ownerMembership) {
      throw new Error("Unauthorized: Admin access required");
    }

    const feature = await ctx.db.get(args.featureRequestId);
    if (!feature) {
      throw new Error("Feature request not found");
    }

    // Delete all votes for this feature
    const votes = await ctx.db
      .query("featureVotes")
      .withIndex("by_feature_request", (q) =>
        q.eq("featureRequestId", args.featureRequestId)
      )
      .collect();

    for (const vote of votes) {
      await ctx.db.delete(vote._id);
    }

    // Delete the feature request
    await ctx.db.delete(args.featureRequestId);

    return { success: true };
  },
});

// ==========================================
// SEED DATA
// ==========================================

type SeedStatus =
  | "planned"
  | "in_progress"
  | "submitted"
  | "under_review"
  | "completed"
  | "declined";

interface SeedFeatureRequest {
  title: string;
  description: string;
  category: string;
  status: SeedStatus;
  adminNotes?: string;
}

export const SEED_FEATURE_REQUESTS: SeedFeatureRequest[] = [
  // ── Planned ──
  {
    title: "GitHub & GitLab CI/CD integration",
    description:
      "Native GitHub Actions and GitLab CI integration that injects environment variables into CI/CD pipelines directly from Envpilot, eliminating the need to duplicate secrets across platforms.",
    category: "Integrations",
    status: "planned",
    adminNotes:
      "GitHub Action package designed at packages/github-action/. Research complete, design finalized. High priority after stable release.",
  },
  {
    title: "VS Code extension on Marketplace",
    description:
      "Publish the @envpilot/vscode-extension to the VS Code Marketplace so users can install it directly from the Extensions panel instead of sideloading the VSIX.",
    category: "Extension",
    status: "planned",
    adminNotes:
      "Extension is feature-complete. Need marketplace publisher account and CI pipeline for automated publishing.",
  },
  {
    title: "Secret rotation & expiry alerts",
    description:
      "Set expiry dates on environment variables and receive email/dashboard alerts before they expire. Optional auto-rotation support for supported secret types (API keys, tokens).",
    category: "Security",
    status: "planned",
    adminNotes:
      "Requires new fields on environmentVariables schema (expiresAt, rotationPolicy). Cron job for expiry checking.",
  },
  {
    title: "Docker & docker-compose secret injection",
    description:
      "CLI command to inject Envpilot variables into Docker containers and docker-compose services at runtime without writing .env files to disk.",
    category: "Integrations",
    status: "planned",
    adminNotes:
      "CLI subcommand: envpilot run -- docker-compose up. Similar to doppler run pattern.",
  },
  {
    title: "Environment comparison & diff view",
    description:
      "Side-by-side comparison view showing differences between environments (dev vs staging vs production) for the same project, highlighting missing, changed, and identical variables.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "UI mockup needed. Should work with encrypted values — compare vault hashes, not plaintext.",
  },
  {
    title: "Team activity feed & Slack notifications",
    description:
      "Real-time activity feed showing who changed what, when. Slack webhook integration for critical events like production variable changes, permission revocations, and new member joins.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "Activity feed from auditLogs table. Slack integration via incoming webhooks — admin configurable per org.",
  },
  {
    title: "Variable tagging & search",
    description:
      "Tag environment variables with custom labels (e.g. 'api-keys', 'database', 'third-party') and search/filter by tags across all projects in an organization.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "New tags array field on environmentVariables. Tag management UI in project settings.",
  },
  {
    title: "CLI binary auto-updater",
    description:
      "Automatic update checking and self-update mechanism for the CLI, notifying users when a new version is available and allowing one-command upgrades.",
    category: "CLI",
    status: "planned",
    adminNotes:
      "Version check endpoint already exists. Need platform-specific binary download + replace logic.",
  },
  {
    title: "Terraform / OpenTofu provider",
    description:
      "Official Terraform provider for Envpilot that allows managing environment variables and project configuration as infrastructure-as-code.",
    category: "Integrations",
    status: "planned",
    adminNotes: "Long-term. Requires stable public API first.",
  },
  {
    title: "Variable comments & change notes",
    description:
      "Add comments and change notes when updating environment variables, creating a discussion thread per variable that gives context on why values were changed.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "New comments table linked to environmentVariables. Show in version history timeline.",
  },
  {
    title: "Mobile app for emergency access",
    description:
      "Lightweight mobile app (iOS/Android) for emergency read-only access to environment variables when away from your workstation. Biometric authentication required.",
    category: "Platform",
    status: "planned",
    adminNotes:
      "React Native or Expo. Read-only initially. Biometric + PIN required. Very long term.",
  },
  {
    title: "Audit log export (CSV / JSON)",
    description:
      "Export audit logs to CSV or JSON format for compliance reporting, external analysis, or archival purposes. Support date range and filter-based exports.",
    category: "Dashboard",
    status: "planned",
    adminNotes:
      "API endpoint for streaming export. Frontend download button on audit logs page.",
  },
  {
    title: "SSO / SAML support",
    description:
      "Enterprise SSO via SAML 2.0 for organizations that require centralized identity management. Enforce SSO-only login per organization.",
    category: "Security",
    status: "planned",
    adminNotes:
      "WorkOS already supports SAML/SSO. Need to enable it in AuthKit config and add org-level SSO enforcement toggle.",
  },
  {
    title: "JetBrains IDE plugin",
    description:
      "Plugin for IntelliJ IDEA, WebStorm, PyCharm, and other JetBrains IDEs with the same capabilities as the VS Code extension — pull/push, sync, tree views, and .env integration.",
    category: "Extension",
    status: "planned",
    adminNotes:
      "Kotlin/Java plugin. Reuse the REST API layer from the VS Code extension backend. Lower priority than VS Code.",
  },
  // ── In Progress ──
  {
    title: "Webhook events system",
    description:
      "Configurable webhook endpoints per organization that fire on events like variable changes, permission updates, and deployment triggers. Includes retry logic and delivery logs.",
    category: "Integrations",
    status: "in_progress",
    adminNotes:
      "Schema designed. Working on webhook delivery queue with Convex scheduled functions.",
  },
  {
    title: "Project-level .env file templates",
    description:
      "Define .env file templates per project that auto-generate properly formatted .env files with comments, grouping, and placeholder values for new team members.",
    category: "Dashboard",
    status: "in_progress",
    adminNotes:
      "environmentTemplates table exists. Building template editor UI and CLI pull --template flag.",
  },
  // ── Under Review ──
  {
    title: "GraphQL API",
    description:
      "Optional GraphQL API endpoint alongside the REST API for clients that prefer GraphQL queries and subscriptions for real-time variable updates.",
    category: "Platform",
    status: "under_review",
    adminNotes:
      "Evaluating if this adds enough value given Convex already provides real-time. May be overkill.",
  },
  {
    title: "Multi-region vault replication",
    description:
      "Replicate encrypted secrets across multiple geographic regions for lower latency access and disaster recovery. EU and US regions initially.",
    category: "Security",
    status: "under_review",
    adminNotes:
      "Depends on WorkOS Vault roadmap. Need to evaluate if we self-host vault or wait for their multi-region support.",
  },
];
