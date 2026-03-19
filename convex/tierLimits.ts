import { v } from "convex/values";
import { query } from "./_generated/server";
import type { DatabaseReader } from "./_generated/server";
import {
  checkNumericLimit,
  checkBooleanFeature,
  countActiveProjects,
  countActiveVariables,
  countMembersAndPendingInvites,
  getUserTier,
} from "./featureRegistry";

/**
 * Tier Limits — Phase 6 cleanup
 *
 * Most limit logic has moved to featureRegistry.ts (feature-based resolution).
 * This file retains enforcement helpers, the backward-compat `checkTierLimit`
 * wrapper, and `getOrganizationUsage` (still consumed by CLI/extension routes).
 */

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
 * Check if a cron job is paused via adminSettings.
 * Crons are statically defined — this flag makes handlers skip work when paused.
 */
export async function isCronPaused(
  db: DatabaseReader,
  settingKey: string
): Promise<boolean> {
  const setting = await db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", settingKey))
    .first();
  return setting?.value === "true";
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
 * Maximum number of variables allowed in bulk import
 */
export const MAX_BULK_IMPORT_SIZE = 100;

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
 * Get current usage counts for an organization.
 * Still used by CLI/extension routes.
 * Resolves tier from the org owner's userTier via featureRegistry.
 */
export const getOrganizationUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) {
      return null;
    }

    const tier = await getUserTier(ctx.db, org.createdBy);

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

    // Limits are now resolved dynamically via featureRegistry.
    // This field is kept as null for backward compat — callers should
    // use useFeatureGate / getResolvedFeatures instead.
    const limits = null;

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
 * Check if a specific action is allowed based on tier limits.
 * Backward-compat wrapper that delegates to featureRegistry helpers.
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
    // Action-to-feature key mapping (backward compatibility layer)
    const ACTION_TO_FEATURE: Record<string, string> = {
      create_project: "max_projects",
      create_variable: "max_variables_per_project",
      add_team_member: "max_team_members",
      use_api: "api_access",
      use_extension: "extension_access",
      use_granular_permissions: "granular_permissions",
      view_version_history: "variable_version_history",
      bulk_import: "bulk_import",
    };

    const featureKey = ACTION_TO_FEATURE[args.action];
    if (!featureKey) {
      return { allowed: false, reason: "Unknown action" };
    }

    // Numeric limit checks (need current count)
    switch (args.action) {
      case "create_project": {
        const count = await countActiveProjects(ctx.db, args.organizationId);
        return await checkNumericLimit(
          ctx.db,
          args.organizationId,
          featureKey,
          count
        );
      }

      case "create_variable": {
        if (!args.projectId) {
          return { allowed: false, reason: "Project ID required" };
        }
        const count = await countActiveVariables(ctx.db, args.projectId);
        return await checkNumericLimit(
          ctx.db,
          args.organizationId,
          featureKey,
          count
        );
      }

      case "add_team_member": {
        const count = await countMembersAndPendingInvites(
          ctx.db,
          args.organizationId
        );
        return await checkNumericLimit(
          ctx.db,
          args.organizationId,
          featureKey,
          count
        );
      }

      // Boolean feature checks
      default:
        return await checkBooleanFeature(
          ctx.db,
          args.organizationId,
          featureKey
        );
    }
  },
});
