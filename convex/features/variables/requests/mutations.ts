import { v, ConvexError } from "convex/values";
import { mutation, MutationCtx } from "../../../_generated/server";
import {
  findEnvironmentConflicts,
  environmentConflictMessage,
} from "../helpers";
import { Id } from "../../../_generated/dataModel";
import { createAuditLog } from "../../../lib/audit";
import { requireAuthedUser } from "../../../lib/identity";
import {
  assertProjectAction,
  isEnvironmentScopeAllowed,
} from "../../../lib/authz";
import {
  checkCountedLimit,
  countActiveVariables,
} from "../../featureRegistry/gates";
import { getProjectAndOrgRole, canReviewRequests } from "./helpers";

const VALID_ENVIRONMENTS = ["development", "staging", "production"] as const;

/**
 * Validate a reviewer-supplied environment override on approve.
 * Requires a non-empty array of known environments with no duplicates.
 */
function assertValidEnvironmentOverride(environments: string[]): void {
  if (environments.length === 0) {
    throw new Error(
      "environments override must contain at least one environment"
    );
  }

  const seen = new Set<string>();
  for (const environment of environments) {
    if (!(VALID_ENVIRONMENTS as readonly string[]).includes(environment)) {
      throw new Error(
        `Invalid environment "${environment}". Allowed: ${VALID_ENVIRONMENTS.join(", ")}`
      );
    }
    if (seen.has(environment)) {
      throw new Error(`Duplicate environment "${environment}" in override`);
    }
    seen.add(environment);
  }
}

const createRequestArgs = {
  key: v.string(),
  vaultRef: v.string(),
  description: v.optional(v.string()),
  environments: v.array(v.string()),
  projectId: v.id("projects"),
  isSensitive: v.optional(v.boolean()),
};

async function createCore(
  ctx: MutationCtx,
  args: {
    key: string;
    vaultRef: string;
    description?: string;
    environments: string[];
    projectId: Id<"projects">;
    isSensitive?: boolean;
    requestedBy: Id<"users">;
  }
) {
  const now = Date.now();

  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  // Requester must be assigned to the project (owners bypass assignment)
  const { orgRole, environmentScope } = await assertProjectAction(
    ctx,
    args.requestedBy,
    args.projectId,
    "project:read"
  );

  if (orgRole !== "developer") {
    throw new Error(
      "Only developers can create variable requests — owners, project managers, and team leads can create variables directly"
    );
  }

  // Environment scope: scoped developers may only request variables whose
  // environments all fall inside their assignment scope
  if (!isEnvironmentScopeAllowed(environmentScope, args.environments)) {
    throw new Error(
      `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
    );
  }

  // Per-environment uniqueness (same rule as direct creation): the key may
  // exist for other environments, but not for any of the requested ones.
  const envClashes = await findEnvironmentConflicts(ctx, {
    projectId: args.projectId,
    key: args.key,
    environments: args.environments,
  });
  if (envClashes.length > 0) {
    throw new ConvexError(environmentConflictMessage(args.key, envClashes));
  }

  const pendingForKey = await ctx.db
    .query("environmentVariableRequests")
    .withIndex("by_project_and_key", (q) =>
      q.eq("projectId", args.projectId).eq("key", args.key)
    )
    .collect();

  const hasPendingDuplicate = pendingForKey.some(
    (request) =>
      request.requestedBy === args.requestedBy &&
      request.status === "pending" &&
      // A pending request for DISJOINT environments is a different variable.
      request.environments.some((env) => args.environments.includes(env))
  );

  if (hasPendingDuplicate) {
    // Keep the phrase "pending request" — the CLI/extension/web API routes
    // match on it to map this rejection to HTTP 409.
    throw new Error(
      `You already have a pending request for "${args.key}". Wait for it to be reviewed, or cancel it from the dashboard before requesting again.`
    );
  }

  const requestId = await ctx.db.insert("environmentVariableRequests", {
    key: args.key,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    projectId: args.projectId,
    organizationId: project.organizationId,
    isSensitive: args.isSensitive ?? false,
    requestedBy: args.requestedBy,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: args.projectId,
    userId: args.requestedBy,
    action: "variable.requested",
    details: {
      requestId,
      key: args.key,
      environments: args.environments,
      isSensitive: args.isSensitive ?? false,
    },
    resourceType: "variable",
    involvesSensitiveData: args.isSensitive ?? false,
  });

  return requestId;
}

export const create = mutation({
  args: createRequestArgs,
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return createCore(ctx, { ...args, requestedBy: actor._id });
  },
});

export const review = mutation({
  args: {
    requestId: v.id("environmentVariableRequests"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reviewReason: v.optional(v.string()),
    // Reviewer may override the approved environments (approve only).
    environments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Variable request not found");
    }

    if (request.status !== "pending") {
      throw new Error(`Request has already been ${request.status}`);
    }

    // An environment override is only meaningful when approving.
    if (args.environments !== undefined && args.action !== "approve") {
      throw new Error(
        "environments override is only allowed when approving a request"
      );
    }

    const { project } = await getProjectAndOrgRole(
      ctx,
      request.projectId,
      actor._id
    );

    // Reviewers: owner, or PM/team lead assigned to the project
    const canReview = await canReviewRequests(
      ctx,
      actor._id,
      request.projectId
    );
    if (!canReview) {
      throw new Error(
        "Only owners, project managers, and team leads can review variable requests"
      );
    }

    if (args.action === "reject") {
      await ctx.db.patch(args.requestId, {
        status: "rejected",
        reviewReason: args.reviewReason,
        reviewedBy: actor._id,
        reviewedAt: now,
        updatedAt: now,
      });

      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: actor._id,
        action: "variable.request_rejected",
        details: {
          requestId: args.requestId,
          key: request.key,
          requesterId: request.requestedBy,
          reviewReason: args.reviewReason,
        },
        resourceType: "variable",
        involvesSensitiveData: request.isSensitive,
      });

      return {
        requestId: args.requestId,
        status: "rejected" as const,
      };
    }

    // Resolve the final approved environment set. When the reviewer supplies
    // an override, validate it and use it in place of the requested set.
    let approvedEnvironments = request.environments;
    if (args.environments !== undefined) {
      assertValidEnvironmentOverride(args.environments);
      approvedEnvironments = args.environments;
    }

    // Tier limit: approving must not push the org past its variable cap.
    // Mirrors the check enforced by variables.create for direct creation.
    // Limit-first: only counts existing variables when the tier's limit is
    // finite, bounded at that limit rather than scanning every variable.
    const varCheck = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      (limit) => countActiveVariables(ctx.db, request.projectId, limit)
    );
    if (!varCheck.allowed) {
      throw new Error(varCheck.reason!);
    }

    // Per-environment uniqueness against the environments actually approved
    // (a reviewer can approve a subset of the requested environments).
    const envClashes = await findEnvironmentConflicts(ctx, {
      projectId: request.projectId,
      key: request.key,
      environments: approvedEnvironments,
    });
    if (envClashes.length > 0) {
      throw new ConvexError(
        environmentConflictMessage(request.key, envClashes)
      );
    }

    const variableId = await ctx.db.insert("environmentVariables", {
      key: request.key,
      vaultRef: request.vaultRef,
      description: request.description,
      environments: approvedEnvironments,
      projectId: request.projectId,
      isSensitive: request.isSensitive,
      createdBy: actor._id,
      lastModifiedBy: actor._id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("variableVersions", {
      variableId,
      version: 1,
      vaultRef: request.vaultRef,
      description: request.description,
      environments: approvedEnvironments,
      changedBy: actor._id,
      changeReason: `Approved request ${args.requestId}`,
      createdAt: now,
    });

    // The requester (a developer with no blanket write access) keeps write
    // access to the variable they requested via an automatic grant.
    await ctx.db.insert("variablePermissions", {
      variableId,
      userId: request.requestedBy,
      permission: "write",
      grantedBy: actor._id,
      grantedAt: now,
      isActive: true,
    });

    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewReason: args.reviewReason,
      reviewedBy: actor._id,
      reviewedAt: now,
      createdVariableId: variableId,
      // Reflect the environments that were actually approved so the UI shows
      // the final set (whether or not the reviewer overrode the request).
      environments: approvedEnvironments,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      variableId,
      userId: actor._id,
      action: "variable.request_approved",
      details: {
        requestId: args.requestId,
        key: request.key,
        requesterId: request.requestedBy,
        reviewReason: args.reviewReason,
        requestedEnvironments: request.environments,
        approvedEnvironments,
      },
      resourceType: "variable",
      involvesSensitiveData: request.isSensitive,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: project._id,
      variableId,
      userId: actor._id,
      action: "variable.created",
      details: {
        key: request.key,
        environments: approvedEnvironments,
        source: "request_approval",
        requestId: args.requestId,
      },
      resourceType: "variable",
      involvesSensitiveData: request.isSensitive,
    });

    return {
      requestId: args.requestId,
      status: "approved" as const,
      variableId,
    };
  },
});

export const cancel = mutation({
  args: {
    requestId: v.id("environmentVariableRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new Error("Variable request not found");
    }

    if (request.status !== "pending") {
      throw new Error(
        `Only pending requests can be canceled (current: ${request.status})`
      );
    }

    await getProjectAndOrgRole(ctx, request.projectId, actor._id);

    // The requester may cancel their own request; otherwise the caller
    // must be a reviewer (owner, or assigned PM/team lead)
    const canCancel =
      request.requestedBy === actor._id ||
      (await canReviewRequests(ctx, actor._id, request.projectId));

    if (!canCancel) {
      throw new Error("Not authorized to cancel this request");
    }

    await ctx.db.patch(args.requestId, {
      status: "canceled",
      reviewedBy: request.requestedBy === actor._id ? undefined : actor._id,
      reviewedAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: actor._id,
      action: "variable.request_canceled",
      details: {
        requestId: args.requestId,
        key: request.key,
        requesterId: request.requestedBy,
      },
      resourceType: "variable",
      involvesSensitiveData: request.isSensitive,
    });

    return args.requestId;
  },
});
