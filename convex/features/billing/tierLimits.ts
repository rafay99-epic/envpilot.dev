import { v } from "convex/values";
import { query } from "../../_generated/server";
import type { DatabaseReader } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import {
  checkNumericLimit,
  checkCountedLimit,
  checkBooleanFeature,
  countActiveProjects,
  countActiveVariables,
  countActiveAccounts,
  countMembersAndPendingInvites,
  countRotationEnabledVariables,
} from "../featureRegistry/gates";
import { getUserTier } from "../featureRegistry/resolver";
import { countActiveShares } from "../sharing/helpers";

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
 * Check if payments are enabled from the database.
 * Defaults to false — payments are off until explicitly enabled from admin panel.
 * The env var NEXT_PUBLIC_PAYMENTS_ENABLED is the outer gate (build-time);
 * this DB toggle is the inner gate (runtime, admin-controllable).
 */
export async function isPaymentsEnabledFromDb(
  db: DatabaseReader
): Promise<boolean> {
  const setting = await db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", "paymentsEnabled"))
    .first();

  if (setting) {
    return setting.value === "true";
  }

  // Default to off until explicitly enabled from admin panel
  return false;
}

/**
 * Public query: check if payments are enabled (DB-level toggle).
 * Called by billing API routes to enforce runtime payment control.
 */
export const isPaymentsEnabled = query({
  args: {},
  handler: async (ctx) => {
    return await isPaymentsEnabledFromDb(ctx.db);
  },
});

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
  const defaultTier = await db
    .query("tierDefinitions")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .first();
  return defaultTier?.name ?? "free";
}

/**
 * Maximum number of variables allowed in bulk import
 */
export const MAX_BULK_IMPORT_SIZE = 100;

/**
 * Count variables per project with a bounded global scan — shared by
 * getOrganizationUsage and getExtendedUsage. Collecting every variable of
 * every project reactively re-ran on every variable write for any open usage
 * view (CLI/extension/web); we cap the total documents scanned across all
 * projects and mark the result `variablesApproximate` if the cap is hit
 * (matches dashboard.ts's `approximate` convention).
 */
async function scanProjectVariables(
  db: DatabaseReader,
  projects: Doc<"projects">[]
): Promise<{
  totalVariables: number;
  maxVariableProject: { projectId: string; projectName: string; count: number };
  variablesApproximate: boolean;
  variableResults: { projectId: string; projectName: string; count: number }[];
}> {
  const VARIABLE_SCAN_CAP = 2000;
  let totalVariables = 0;
  let maxVariableProject = { projectId: "", projectName: "", count: 0 };
  let variablesApproximate = false;
  let variableBudget = VARIABLE_SCAN_CAP;
  const variableResults: {
    projectId: string;
    projectName: string;
    count: number;
  }[] = [];
  for (const project of projects) {
    if (variableBudget <= 0) {
      variablesApproximate = true;
      break;
    }
    const projectVars = await db
      .query("environmentVariables")
      .withIndex("by_project", (q) => q.eq("projectId", project._id))
      .take(variableBudget);
    variableBudget -= projectVars.length;
    const count = projectVars.filter((v2) => !v2.deletedAt).length;
    const entry = {
      projectId: project._id as string,
      projectName: project.name,
      count,
    };
    variableResults.push(entry);
    totalVariables += count;
    if (count > maxVariableProject.count) {
      maxVariableProject = entry;
    }
  }
  return {
    totalVariables,
    maxVariableProject,
    variablesApproximate,
    variableResults,
  };
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

    // Parallel fetch: projects, members, pending invitations. The index
    // narrows rows to the org; soft-delete/status refinement happens in JS
    // over the already-fetched rows (same read cost as a query .filter).
    const [projects, members, pendingInvitations] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
        .then((rows) => rows.filter((p) => !p.deletedAt)),
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
        .collect()
        .then((rows) => rows.filter((i) => i.status === "pending")),
    ]);

    // Count variables per project with a bounded global scan — same
    // VARIABLE_SCAN_CAP pattern as dashboard.ts::getStats. Collecting every
    // variable of every project reactively re-ran on every variable write
    // for any open usage view (CLI/extension/web); we cap the total
    // documents scanned across all projects and mark the result
    // `variablesApproximate` if the cap is hit (matches dashboard.ts's
    // `approximate` convention).
    const {
      totalVariables,
      maxVariableProject,
      variablesApproximate,
      variableResults,
    } = await scanProjectVariables(ctx.db, projects);

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
        // True when the variable scan hit VARIABLE_SCAN_CAP; totals above
        // are a lower-bound approximation in that case.
        variablesApproximate,
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
        // Limit-first: only counts existing variables when the tier's limit
        // is finite, bounded at that limit rather than scanning every
        // variable in the project.
        const projectId = args.projectId;
        return await checkCountedLimit(
          ctx.db,
          args.organizationId,
          featureKey,
          (limit) => countActiveVariables(ctx.db, projectId, limit)
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

/**
 * Extended usage query — returns all metered resource counts for the usage page.
 * Includes everything from getOrganizationUsage plus:
 * - Active secret shares
 * - Rotation-enabled variables
 * - Shared accounts (service login credentials)
 * - Pending invitations (separate from team member count)
 */
export const getExtendedUsage = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;

    const tier = await getUserTier(ctx.db, org.createdBy);

    // Fetch all counts in parallel
    const [
      projects,
      members,
      pendingInvitations,
      activeShares,
      rotationEnabledVars,
      sharedAccounts,
    ] = await Promise.all([
      ctx.db
        .query("projects")
        .withIndex("by_organization", (q) =>
          q.eq("organizationId", args.organizationId)
        )
        .collect()
        .then((rows) => rows.filter((p) => !p.deletedAt)),
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
        .collect()
        .then((rows) =>
          rows.filter((i) => i.status === "pending" && i.expiresAt > Date.now())
        ),
      countActiveShares(ctx.db, args.organizationId),
      countRotationEnabledVariables(ctx.db, args.organizationId),
      countActiveAccounts(ctx.db, args.organizationId),
    ]);

    // Variable counts per project — same bounded-scan pattern as
    // getOrganizationUsage above / dashboard.ts::getStats. Caps total
    // documents read across all projects instead of collecting every
    // variable of every project on every reactive re-run.
    const {
      totalVariables,
      maxVariableProject,
      variablesApproximate,
      variableResults,
    } = await scanProjectVariables(ctx.db, projects);

    return {
      tier,
      usage: {
        projects: projects.length,
        teamMembers: members.length,
        pendingInvitations: pendingInvitations.length,
        totalVariables,
        maxVariablesInProject: maxVariableProject.count,
        maxVariablesProjectName: maxVariableProject.projectName,
        variablesPerProject: variableResults,
        // True when the variable scan hit VARIABLE_SCAN_CAP; totals above
        // are a lower-bound approximation in that case.
        variablesApproximate,
        activeShares,
        rotationEnabledVars,
        sharedAccounts,
      },
    };
  },
});
