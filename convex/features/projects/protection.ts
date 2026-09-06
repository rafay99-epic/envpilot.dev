import { v, ConvexError } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import {
  assertProjectAction,
  assertProjectCapability,
  hasCapability,
  isEnvironmentScopeAllowed,
} from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";
import { syncWorkspaceProtection } from "../../lib/protection";
import { isWorkspace } from "../../lib/projectKind";

/**
 * Protected environments: the CONFIG surface.
 *
 * Enforcement lives in lib/protection.ts and never consults the feature
 * registry. Only turning protection ON (or widening it) is tier-gated here,
 * so an org that loses the feature can still turn it off.
 */

const VALID_ENVIRONMENTS = ["development", "staging", "production"];

// Bound on the pending-request count reported to the UI.
const PENDING_COUNT_CAP = 200;

export const setProtection = mutation({
  args: {
    projectId: v.id("projects"),
    environments: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const seen = new Set<string>();
    for (const environment of args.environments) {
      if (!VALID_ENVIRONMENTS.includes(environment)) {
        throw new ConvexError(
          `Invalid environment "${environment}". Allowed: ${VALID_ENVIRONMENTS.join(", ")}`
        );
      }
      if (seen.has(environment)) {
        throw new ConvexError(`Duplicate environment "${environment}"`);
      }
      seen.add(environment);
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }
    if (isWorkspace(project)) {
      throw new ConvexError(
        "A shared group's protection follows the projects that read it."
      );
    }

    await assertProjectCapability(
      ctx,
      actor._id,
      args.projectId,
      "project.protection.manage",
      project
    );

    // Widening needs the tier gate; narrowing and clearing never do.
    const current = project.protection?.environments ?? [];
    const widening = args.environments.some((env) => !current.includes(env));
    if (widening) {
      const gate = await checkBooleanFeature(
        ctx.db,
        project.organizationId,
        "protected_environments"
      );
      if (!gate.allowed) {
        throw new ConvexError(
          "Protected environments require a higher tier. Upgrade to require approval for production writes."
        );
      }
    }

    const now = Date.now();
    await ctx.db.patch(args.projectId, {
      protection:
        args.environments.length > 0
          ? {
              environments: args.environments,
              updatedBy: actor._id,
              updatedAt: now,
            }
          : undefined,
      updatedAt: now,
    });

    const memberships = await ctx.db
      .query("workspaceProjects")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const membership of memberships) {
      await syncWorkspaceProtection(ctx, membership.workspaceId, actor._id);
    }

    if (args.environments.length > 0) {
      // Both sets, always: narrowing from [staging, production] to [staging]
      // unprotects production, and an audit row that only names the new set
      // would hide that.
      await createAuditLog(ctx, {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: actor._id,
        action: "protection.enabled",
        details: { previous: current, environments: args.environments },
      });
    } else {
      const pending = await ctx.db
        .query("changeRequests")
        .withIndex("by_project_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "pending")
        )
        .take(PENDING_COUNT_CAP);
      await createAuditLog(ctx, {
        organizationId: project.organizationId,
        projectId: args.projectId,
        userId: actor._id,
        action: "protection.disabled",
        details: {
          previous: current,
          environments: [],
          pendingCount: pending.length,
        },
      });
    }

    return args.environments;
  },
});

export const getProtection = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    const { profile, environmentScope } = await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:read",
      project
    );

    const gate = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "protected_environments"
    );

    const pending = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .take(PENDING_COUNT_CAP);

    return {
      environments: project.protection?.environments ?? [],
      // The environments this member may write to. Forms offer only these,
      // so a scoped developer never sees production as a choice at all.
      allowedEnvironments: environmentScope ?? VALID_ENVIRONMENTS,
      canManage: hasCapability(profile, "project.protection.manage"),
      canApprove: hasCapability(profile, "project.protection.approve"),
      canOverride: hasCapability(profile, "project.protection.override"),
      featureAllowed: gate.allowed,
      // Counts only what this member could open: a scoped reader must not
      // learn from a badge that a production change is in flight.
      pendingCount: pending.filter((request) =>
        isEnvironmentScopeAllowed(environmentScope, request.environments)
      ).length,
    };
  },
});
