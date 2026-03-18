import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/**
 * Tier Limits Configuration
 *
 * Defines limits for each subscription tier. Tier definitions are stored
 * in the `tierDefinitions` table and managed via the admin panel.
 *
 * The hardcoded SEED_TIER_DEFAULTS are used only as fallbacks when
 * no tier definitions exist in the database yet.
 *
 * Enforcement is controlled by the admin panel toggle (adminSettings
 * key: "tierEnforcement") with env var ENFORCE_TIER_LIMITS as fallback.
 */

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

/**
 * Seed defaults used when no tierDefinitions exist in the database.
 * These match the original hardcoded "free" and "pro" tiers.
 */
export const SEED_TIER_DEFAULTS: Record<string, TierLimits> = {
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
 * Check if tier enforcement is enabled (server-side only).
 * Reads from Convex env var ENFORCE_TIER_LIMITS as a fallback.
 * The primary source of truth is the adminSettings table (key: "tierEnforcement").
 * Use isEnforcementEnabledFromDb() when you have DB access.
 */
export function isEnforcementEnabledServer(): boolean {
  // Only enforce if explicitly set to "true". Missing env var = disabled (pre-alpha safe).
  return process.env.ENFORCE_TIER_LIMITS === "true";
}

/**
 * Check if tier enforcement is enabled from the database.
 * Falls back to env var if no DB setting exists.
 */
export async function isEnforcementEnabledFromDb(
  db: DatabaseReader
): Promise<boolean> {
  const setting = await db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", "tierEnforcement"))
    .first();

  if (setting) {
    return setting.value === "true";
  }

  // Fallback to env var
  return isEnforcementEnabledServer();
}

/**
 * Get a tier definition from the database by name.
 * Returns null if not found.
 */
export async function getTierDefinition(db: DatabaseReader, tierName: string) {
  return await db
    .query("tierDefinitions")
    .withIndex("by_name", (q) => q.eq("name", tierName))
    .first();
}

/**
 * Get the default tier name from the database.
 * Falls back to "free" if no default tier is defined.
 */
export async function getDefaultTierName(db: DatabaseReader): Promise<string> {
  const allTiers = await db.query("tierDefinitions").collect();
  const defaultTier = allTiers.find((t) => t.isDefault);
  return defaultTier?.name ?? "free";
}

/**
 * Convert a tier definition's limits + features into a TierLimits object.
 */
function tierDefinitionToLimits(tierDef: {
  limits: {
    maxProjects: number | null;
    maxVariablesPerProject: number | null;
    maxTeamMembers: number | null;
    maxOrganizations: number | null;
    auditLogRetentionDays: number;
  };
  features: {
    apiAccessEnabled: boolean;
    extensionAccessEnabled: boolean;
    granularPermissionsEnabled: boolean;
    variableVersionHistoryEnabled: boolean;
    bulkImportEnabled: boolean;
  };
}): TierLimits {
  return {
    maxProjects: tierDef.limits.maxProjects,
    maxVariablesPerProject: tierDef.limits.maxVariablesPerProject,
    maxTeamMembers: tierDef.limits.maxTeamMembers,
    maxOrganizations: tierDef.limits.maxOrganizations,
    auditLogRetentionDays: tierDef.limits.auditLogRetentionDays,
    apiAccessEnabled: tierDef.features.apiAccessEnabled,
    extensionAccessEnabled: tierDef.features.extensionAccessEnabled,
    granularPermissionsEnabled: tierDef.features.granularPermissionsEnabled,
    variableVersionHistoryEnabled:
      tierDef.features.variableVersionHistoryEnabled,
    bulkImportEnabled: tierDef.features.bulkImportEnabled,
  };
}

/**
 * Get tier limits from the database for a given tier name.
 * Reads from tierDefinitions table. Falls back to seed defaults
 * if no tier definition exists for the given name.
 */
export async function getTierLimitsFromDb(
  db: DatabaseReader,
  tier: string
): Promise<TierLimits> {
  const enforced = await isEnforcementEnabledFromDb(db);
  if (!enforced) {
    return UNLIMITED_LIMITS;
  }

  // Try to get tier definition from DB
  const tierDef = await getTierDefinition(db, tier);
  if (tierDef) {
    return tierDefinitionToLimits(tierDef);
  }

  // Fallback to seed defaults
  if (tier in SEED_TIER_DEFAULTS) {
    return SEED_TIER_DEFAULTS[tier];
  }

  // Unknown tier — return unlimited (safe fallback)
  return UNLIMITED_LIMITS;
}

/**
 * Get tier limits with validation (uses seed defaults, no DB).
 * For server-side use when DB is not available.
 */
export function getTierLimits(tier: string): TierLimits {
  if (!isEnforcementEnabledServer()) {
    return UNLIMITED_LIMITS;
  }
  if (tier in SEED_TIER_DEFAULTS) {
    return SEED_TIER_DEFAULTS[tier];
  }
  // Unknown tier — return unlimited (safe fallback)
  return UNLIMITED_LIMITS;
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
 * Falls back to the default tier if no tier record exists.
 */
export async function getOrganizationTier(
  db: DatabaseReader,
  organizationId: Id<"organizations">
): Promise<string> {
  const tierRecord = await db
    .query("organizationTiers")
    .withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
    .first();
  if (tierRecord) {
    return tierRecord.tier;
  }
  return await getDefaultTierName(db);
}

// ==========================================
// QUERIES
// ==========================================

/**
 * Check if tier enforcement is enabled (for UI display)
 */
export const isEnforcementEnabled = query({
  args: {},
  handler: async (ctx) => {
    return isEnforcementEnabledFromDb(ctx.db);
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
      limits: await getTierLimitsFromDb(ctx.db, tier),
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

    const limits = await getTierLimitsFromDb(ctx.db, tier);

    return {
      tier,
      limits,
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

    const limits = await getTierLimitsFromDb(ctx.db, tier);

    return {
      tier,
      limits,
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

    // Get organizations details to determine effective tier
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

    // Get the user's "effective" tier — the highest tier among owned orgs
    // We check each tier's maxOrganizations limit and pick the most permissive
    let effectiveTier = await getDefaultTierName(ctx.db);
    let bestOrgLimit: number | null = 0;

    for (const o of ownedOrgs) {
      const limits = await getTierLimitsFromDb(ctx.db, o.tier);
      if (limits.maxOrganizations === null) {
        // Unlimited — this is the best possible
        effectiveTier = o.tier;
        bestOrgLimit = null;
        break;
      }
      if (bestOrgLimit !== null && limits.maxOrganizations > bestOrgLimit) {
        bestOrgLimit = limits.maxOrganizations;
        effectiveTier = o.tier;
      }
    }

    return {
      effectiveTier,
      limits: await getTierLimitsFromDb(ctx.db, effectiveTier),
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
    const limits = await getTierLimitsFromDb(ctx.db, tier);

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
            : `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade your tier for more projects.`,
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
            : `Variable limit reached (${variableCount.length}/${limits.maxVariablesPerProject}). Upgrade your tier for more variables.`,
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
            : `Team member limit reached (${totalMembers}/${limits.maxTeamMembers}). Upgrade your tier for more team members.`,
        };
      }

      case "use_api":
        return {
          allowed: limits.apiAccessEnabled,
          reason: limits.apiAccessEnabled
            ? undefined
            : "API access requires a higher tier.",
        };

      case "use_extension":
        return {
          allowed: limits.extensionAccessEnabled,
          reason: limits.extensionAccessEnabled
            ? undefined
            : "Extension access requires a higher tier.",
        };

      case "use_granular_permissions":
        return {
          allowed: limits.granularPermissionsEnabled,
          reason: limits.granularPermissionsEnabled
            ? undefined
            : "Granular permissions require a higher tier.",
        };

      case "view_version_history":
        return {
          allowed: limits.variableVersionHistoryEnabled,
          reason: limits.variableVersionHistoryEnabled
            ? undefined
            : "Version history requires a higher tier.",
        };

      case "bulk_import":
        return {
          allowed: limits.bulkImportEnabled,
          reason: limits.bulkImportEnabled
            ? undefined
            : "Bulk import requires a higher tier.",
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
    const limits = await getTierLimitsFromDb(ctx.db, tier);
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
        reason: `Project limit reached (${projectCount.length}/${limits.maxProjects}). Upgrade your tier for more projects.`,
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
    const limits = await getTierLimitsFromDb(ctx.db, tier);
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
        reason: `Variable limit reached (${variableCount.length}/${limits.maxVariablesPerProject}). Upgrade your tier for more variables.`,
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
    const limits = await getTierLimitsFromDb(ctx.db, tier);
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
        reason: `Team member limit reached (${totalMembers}/${limits.maxTeamMembers}). Upgrade your tier for more team members.`,
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

    // Find the most permissive tier among owned orgs
    let bestOrgLimit: number | null = 0;
    for (const membership of memberships) {
      const tier = await getOrganizationTier(ctx.db, membership.organizationId);
      const limits = await getTierLimitsFromDb(ctx.db, tier);
      if (limits.maxOrganizations === null) {
        return { allowed: true };
      }
      if (bestOrgLimit !== null && limits.maxOrganizations > bestOrgLimit) {
        bestOrgLimit = limits.maxOrganizations;
      }
    }

    if (bestOrgLimit === null) {
      return { allowed: true };
    }

    // If no owned orgs, use default tier limits
    if (memberships.length === 0) {
      const defaultTier = await getDefaultTierName(ctx.db);
      const limits = await getTierLimitsFromDb(ctx.db, defaultTier);
      bestOrgLimit = limits.maxOrganizations ?? 0;
      if (limits.maxOrganizations === null) {
        return { allowed: true };
      }
    }

    if (memberships.length >= bestOrgLimit) {
      return {
        allowed: false,
        reason: `Organization limit reached (${memberships.length}/${bestOrgLimit}). Upgrade your tier for more organizations.`,
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
    const limits = await getTierLimitsFromDb(ctx.db, tier);

    switch (args.feature) {
      case "api":
        return {
          allowed: limits.apiAccessEnabled,
          reason: limits.apiAccessEnabled
            ? undefined
            : "API access requires a higher tier.",
        };
      case "extension":
        return {
          allowed: limits.extensionAccessEnabled,
          reason: limits.extensionAccessEnabled
            ? undefined
            : "Extension access requires a higher tier.",
        };
      case "granular_permissions":
        return {
          allowed: limits.granularPermissionsEnabled,
          reason: limits.granularPermissionsEnabled
            ? undefined
            : "Granular permissions require a higher tier.",
        };
      case "version_history":
        return {
          allowed: limits.variableVersionHistoryEnabled,
          reason: limits.variableVersionHistoryEnabled
            ? undefined
            : "Version history requires a higher tier.",
        };
      case "bulk_import":
        return {
          allowed: limits.bulkImportEnabled,
          reason: limits.bulkImportEnabled
            ? undefined
            : "Bulk import requires a higher tier.",
        };
      default:
        return { allowed: false, reason: "Unknown feature" };
    }
  },
});
