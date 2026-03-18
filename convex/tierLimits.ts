import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Tier Limits Configuration
 *
 * Defines limits for each subscription tier.
 * Free tier has sensible defaults, Pro tier is unlimited.
 *
 * Enforcement is controlled by the ENFORCE_TIER_LIMITS Convex env var
 * (server-side only). When disabled (pre-alpha mode), all tiers get
 * unlimited access. No client input can affect enforcement.
 */

export type Tier = "free" | "pro";

export interface TierLimits {
  maxProjects: number | null; // null = unlimited
  maxVariablesPerProject: number | null;
  maxTeamMembers: number | null;
  maxOrganizations: number | null;
  auditLogRetentionDays: number;
  apiAccessEnabled: boolean;
  extensionAccessEnabled: boolean;
  granularPermissionsEnabled: boolean;
  variableVersionHistoryEnabled: boolean;
  bulkImportEnabled: boolean;
}

/**
 * Unlimited tier config used when enforcement is disabled (pre-alpha mode).
 * All limits are null (unlimited) and all features are enabled.
 */
const UNLIMITED_LIMITS: TierLimits = {
  maxProjects: null,
  maxVariablesPerProject: null,
  maxTeamMembers: null,
  maxOrganizations: null,
  auditLogRetentionDays: 730,
  apiAccessEnabled: true,
  extensionAccessEnabled: true,
  granularPermissionsEnabled: true,
  variableVersionHistoryEnabled: true,
  bulkImportEnabled: true,
};

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    maxProjects: 3,
    maxVariablesPerProject: 50,
    maxTeamMembers: 3,
    maxOrganizations: 1,
    auditLogRetentionDays: 7,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    granularPermissionsEnabled: false,
    variableVersionHistoryEnabled: false,
    bulkImportEnabled: false,
  },
  pro: {
    maxProjects: null,
    maxVariablesPerProject: null,
    maxTeamMembers: null,
    maxOrganizations: null,
    auditLogRetentionDays: 365,
    apiAccessEnabled: true,
    extensionAccessEnabled: true,
    granularPermissionsEnabled: true,
    variableVersionHistoryEnabled: true,
    bulkImportEnabled: true,
  },
};

/**
 * Type guard to validate tier values
 */
export function isValidTier(tier: string): tier is Tier {
  return tier === "free" || tier === "pro";
}

/**
 * Check if tier enforcement is enabled (server-side only).
 * Reads from Convex env var ENFORCE_TIER_LIMITS.
 * Defaults to true (enforce) — set to "false" for pre-alpha mode.
 */
export function isEnforcementEnabledServer(): boolean {
  return process.env.ENFORCE_TIER_LIMITS !== "false";
}

/**
 * Get tier limits with validation.
 * Reads enforcement toggle from Convex server env var — no client input.
 */
export function getTierLimits(tier: string): TierLimits {
  if (!isValidTier(tier)) {
    throw new Error(`Invalid tier: ${tier}`);
  }
  if (!isEnforcementEnabledServer()) {
    return UNLIMITED_LIMITS;
  }
  return TIER_LIMITS[tier];
}

/**
 * Maximum number of variables allowed in bulk import
 */
export const MAX_BULK_IMPORT_SIZE = 100;

// ==========================================
// HELPERS
// ==========================================

/**
 * Read an organization's tier from the organizationTiers table.
 * Falls back to "free" if no tier record exists.
 */
export async function getOrganizationTier(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<Tier> {
  const tierRecord = await db
    .query("organizationTiers")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  return tierRecord?.tier ?? "free";
}

// ==========================================
// QUERIES
// ==========================================

/**
 * Check if tier enforcement is enabled (for UI display)
 */
export const isEnforcementEnabled = query({
  args: {},
  handler: async () => {
    return isEnforcementEnabledServer();
  },
});

/**
 * Get tier limits configuration for an organization
 */
export const getOrganizationLimits = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }
    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    return {
      tier,
      limits: getTierLimits(tier),
    };
  },
});

/**
 * Get current usage counts for an organization
 */
export const getOrganizationUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return null;
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);

    // Parallel fetch: projects, members, pending invitations
    const [projects, members, pendingInvitations] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .collect(),
      ctx.db
        .query("organizationMembers")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect(),
      ctx.db
        .query("invitations")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .filter((q) => q.eq(q.field("status"), "pending"))
        .collect(),
    ]);

    // Parallel fetch: variable counts per project
    const variableResults = await Promise.all(
      projects.map(async (project) => {
        const variables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        return {
          projectId: project._id as string,
          projectName: project.name,
          count: variables.length,
        };
      })
    );

    let totalVariables = 0;
    let maxVariableProject = { projectId: "", projectName: "", count: 0 };
    for (const vc of variableResults) {
      totalVariables += vc.count;
      if (vc.count > maxVariableProject.count) {
        maxVariableProject = vc;
      }
    }

    return {
      tier,
      limits: getTierLimits(tier),
      usage: {
        projects: projects.length,
        teamMembers: members.length,
        pendingInvitations: pendingInvitations.length,
        totalVariables,
        maxVariablesInProject: maxVariableProject.count,
        maxVariablesProjectName: maxVariableProject.projectName,
        variablesPerProject: variableResults,
      },
    };
  },
});

/**
 * Get variable count for a specific project
 */
export const getProjectVariableCount = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new Error("Project not found");
    }

    const org = await ctx.db.get(project.organizationId);
    if (!org) {
      throw new Error("Organization not found");
    }

    const tier = await getOrganizationTier(ctx.db, project.organizationId);

    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    return {
      tier,
      limits: getTierLimits(tier),
      usage: {
        variables: variables.length,
      },
    };
  },
});

/**
 * Get organizations count for a user
 */
export const getUserOrganizationCount = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    // Count organizations where user is an admin (created/owns them)
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Get organizations details to check which are pro tier
    const orgsWithRoles = await Promise.all(
      memberships.map(async (membership) => {
        const org = await ctx.db.get(membership.organizationId);
        if (!org) return null;
        const tier = await getOrganizationTier(
          ctx.db,
          membership.organizationId
        );
        return { org, role: membership.role, tier };
      })
    );

    const validOrgs = orgsWithRoles.filter(Boolean) as NonNullable<
      (typeof orgsWithRoles)[0]
    >[];

    // For organization creation limits, we count orgs where user is admin (owner)
    const ownedOrgs = validOrgs.filter((o) => o.role === "admin");

    // Get the user's "primary" tier (highest tier among owned orgs, or free if none)
    const hasPro = ownedOrgs.some((o) => o.tier === "pro");
    const effectiveTier: Tier = hasPro ? "pro" : "free";

    return {
      effectiveTier,
      limits: getTierLimits(effectiveTier),
      usage: {
        ownedOrganizations: ownedOrgs.length,
        totalMemberships: memberships.length,
      },
    };
  },
});

/**
 * Check if a specific action is allowed based on tier limits
 */
export const checkTierLimit = query({
  args: {
    organizationId: v.id("organizations"),
    action: v.union(
      v.literal("create_project"),
      v.literal("create_variable"),
      v.literal("add_team_member"),
      v.literal("use_api"),
      v.literal("use_extension"),
      v.literal("use_granular_permissions"),
      v.literal("view_version_history"),
      v.literal("bulk_import")
    ),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { allowed: false, reason: "Organization not found" };
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = getTierLimits(tier);

    switch (args.action) {
      case "create_project": {
        if (limits.maxProjects === null) {
          return { allowed: true };
        }
        const projectCount = await ctx.db
          .query("projects")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        const isAllowed = projectCount.length < limits.maxProjects;
        return {
          allowed: isAllowed,
          current: projectCount.length,
          limit: limits.maxProjects,
          reason: isAllowed
            ? undefined
            : `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade to Pro for unlimited projects.`,
        };
      }

      case "create_variable": {
        if (!args.projectId) {
          return { allowed: false, reason: "Project ID required" };
        }
        if (limits.maxVariablesPerProject === null) {
          return { allowed: true };
        }
        const variableCount = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project", (q) => q.eq("projectId", args.projectId!))
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .collect();
        const isAllowed = variableCount.length < limits.maxVariablesPerProject;
        return {
          allowed: isAllowed,
          current: variableCount.length,
          limit: limits.maxVariablesPerProject,
          reason: isAllowed
            ? undefined
            : `Variable limit reached (${variableCount.length}/${limits.maxVariablesPerProject}). Upgrade to Pro for unlimited variables.`,
        };
      }

      case "add_team_member": {
        if (limits.maxTeamMembers === null) {
          return { allowed: true };
        }
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .collect();
        const pendingInvitations = await ctx.db
          .query("invitations")
          .withIndex("by_organization", (q) =>
            q.eq("organizationId", args.organizationId)
          )
          .filter((q) => q.eq(q.field("status"), "pending"))
          .collect();
        const totalMembers = members.length + pendingInvitations.length;
        const isAllowed = totalMembers < limits.maxTeamMembers;
        return {
          allowed: isAllowed,
          current: totalMembers,
          limit: limits.maxTeamMembers,
          reason: isAllowed
            ? undefined
            : `Team member limit reached (${totalMembers}/${limits.maxTeamMembers}). Upgrade to Pro for unlimited team members.`,
        };
      }

      case "use_api":
        return {
          allowed: limits.apiAccessEnabled,
          reason: limits.apiAccessEnabled
            ? undefined
            : "API access requires Pro tier. Upgrade to unlock API access.",
        };

      case "use_extension":
        return {
          allowed: limits.extensionAccessEnabled,
          reason: limits.extensionAccessEnabled
            ? undefined
            : "Extension access requires Pro tier. Upgrade to unlock VS Code/IDE extension.",
        };

      case "use_granular_permissions":
        return {
          allowed: limits.granularPermissionsEnabled,
          reason: limits.granularPermissionsEnabled
            ? undefined
            : "Granular permissions require Pro tier. Upgrade to set per-variable access controls.",
        };

      case "view_version_history":
        return {
          allowed: limits.variableVersionHistoryEnabled,
          reason: limits.variableVersionHistoryEnabled
            ? undefined
            : "Version history requires Pro tier. Upgrade to access full variable history.",
        };

      case "bulk_import":
        return {
          allowed: limits.bulkImportEnabled,
          reason: limits.bulkImportEnabled
            ? undefined
            : "Bulk import requires Pro tier. Upgrade to import variables in bulk.",
        };

      default:
        return { allowed: false, reason: "Unknown action" };
    }
  },
});

// ==========================================
// INTERNAL QUERIES (for use in mutations)
// ==========================================

/**
 * Internal helper to check project creation limit
 */
export const _checkProjectLimit = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    args
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { allowed: false, reason: "Organization not found" };
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = getTierLimits(tier);
    if (limits.maxProjects === null) {
      return { allowed: true };
    }

    const projectCount = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    if (projectCount.length >= limits.maxProjects) {
      return {
        allowed: false,
        reason: `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade to Pro for unlimited projects.`,
      };
    }

    return { allowed: true };
  },
});

/**
 * Internal helper to check variable creation limit
 */
export const _checkVariableLimit = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (
    ctx,
    args
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      return { allowed: false, reason: "Project not found" };
    }

    const org = await ctx.db.get(project.organizationId);
    if (!org) {
      return { allowed: false, reason: "Organization not found" };
    }

    const tier = await getOrganizationTier(ctx.db, project.organizationId);
    const limits = getTierLimits(tier);
    if (limits.maxVariablesPerProject === null) {
      return { allowed: true };
    }

    const variableCount = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .collect();

    if (variableCount.length >= limits.maxVariablesPerProject) {
      return {
        allowed: false,
        reason: `Variable limit reached (${variableCount.length}/${limits.maxVariablesPerProject}). Upgrade to Pro for unlimited variables.`,
      };
    }

    return { allowed: true };
  },
});

/**
 * Internal helper to check team member limit
 */
export const _checkTeamMemberLimit = internalQuery({
  args: { organizationId: v.id("organizations") },
  handler: async (
    ctx,
    args
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { allowed: false, reason: "Organization not found" };
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = getTierLimits(tier);
    if (limits.maxTeamMembers === null) {
      return { allowed: true };
    }

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect();

    const pendingInvitations = await ctx.db
      .query("invitations")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    const totalMembers = members.length + pendingInvitations.length;

    if (totalMembers >= limits.maxTeamMembers) {
      return {
        allowed: false,
        reason: `Team member limit reached (${totalMembers}/${limits.maxTeamMembers}). Upgrade to Pro for unlimited team members.`,
      };
    }

    return { allowed: true };
  },
});

/**
 * Internal helper to check organization creation limit
 */
export const _checkOrganizationLimit = internalQuery({
  args: { userId: v.id("users") },
  handler: async (
    ctx,
    args
  ): Promise<{ allowed: boolean; reason?: string }> => {
    // Get all organizations where user is admin
    const memberships = await ctx.db
      .query("organizationMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("role"), "admin"))
      .collect();

    // Check if any owned org is Pro tier
    let hasPro = false;
    for (const membership of memberships) {
      const tier = await getOrganizationTier(ctx.db, membership.organizationId);
      if (tier === "pro") {
        hasPro = true;
        break;
      }
    }

    const effectiveTier: Tier = hasPro ? "pro" : "free";
    const limits = getTierLimits(effectiveTier);

    if (limits.maxOrganizations === null) {
      return { allowed: true };
    }

    if (memberships.length >= limits.maxOrganizations) {
      return {
        allowed: false,
        reason: `Organization limit reached (${memberships.length}/${limits.maxOrganizations}). Upgrade to Pro for unlimited organizations.`,
      };
    }

    return { allowed: true };
  },
});

/**
 * Internal helper to check if a feature is enabled for a tier
 */
export const _checkFeatureEnabled = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    feature: v.union(
      v.literal("api"),
      v.literal("extension"),
      v.literal("granular_permissions"),
      v.literal("version_history"),
      v.literal("bulk_import")
    ),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ allowed: boolean; reason?: string }> => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return { allowed: false, reason: "Organization not found" };
    }

    const tier = await getOrganizationTier(ctx.db, args.organizationId);
    const limits = getTierLimits(tier);

    switch (args.feature) {
      case "api":
        return {
          allowed: limits.apiAccessEnabled,
          reason: limits.apiAccessEnabled
            ? undefined
            : "API access requires Pro tier.",
        };
      case "extension":
        return {
          allowed: limits.extensionAccessEnabled,
          reason: limits.extensionAccessEnabled
            ? undefined
            : "Extension access requires Pro tier.",
        };
      case "granular_permissions":
        return {
          allowed: limits.granularPermissionsEnabled,
          reason: limits.granularPermissionsEnabled
            ? undefined
            : "Granular permissions require Pro tier.",
        };
      case "version_history":
        return {
          allowed: limits.variableVersionHistoryEnabled,
          reason: limits.variableVersionHistoryEnabled
            ? undefined
            : "Version history requires Pro tier.",
        };
      case "bulk_import":
        return {
          allowed: limits.bulkImportEnabled,
          reason: limits.bulkImportEnabled
            ? undefined
            : "Bulk import requires Pro tier.",
        };
      default:
        return { allowed: false, reason: "Unknown feature" };
    }
  },
});
