import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { createAuditLog } from "./auditHelpers";
import {
  assertOrgMembership,
  assertProjectAction,
  isEnvironmentScopeAllowed,
} from "./authz";
import { checkNumericLimit, countActiveVariables } from "./featureRegistry";

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

async function getProjectAndOrgRole(
  ctx: MutationCtx | QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  const { membership } = await assertOrgMembership(
    ctx,
    userId,
    project.organizationId
  );

  return { project, orgRole: membership.role };
}

/**
 * Non-throwing check: can this user review (approve/reject) requests?
 * Reviewers are owners, or PMs/team leads assigned to the project.
 */
async function canReviewRequests(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  projectId: Id<"projects">
): Promise<boolean> {
  try {
    await assertProjectAction(
      ctx,
      userId,
      projectId,
      "project:update_variable"
    );
    return true;
  } catch {
    return false;
  }
}

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    userId: v.id("users"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("canceled")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { project } = await getProjectAndOrgRole(
      ctx,
      args.projectId,
      args.userId
    );

    const requests = args.status
      ? await ctx.db
          .query("environmentVariableRequests")
          .withIndex("by_project_and_status", (q) =>
            q.eq("projectId", project._id).eq("status", args.status!)
          )
          .collect()
      : await ctx.db
          .query("environmentVariableRequests")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .collect();

    // Reviewers (owner, assigned PM/team lead) see every request;
    // everyone else only sees their own.
    const canReview = await canReviewRequests(ctx, args.userId, args.projectId);
    const visibleRequests = canReview
      ? requests
      : requests.filter((request) => request.requestedBy === args.userId);

    const sortedRequests = [...visibleRequests].sort(
      (a, b) => b.createdAt - a.createdAt
    );

    const requestsWithUsers = await Promise.all(
      sortedRequests.map(async (request) => {
        const requester = await ctx.db.get(request.requestedBy);
        const reviewer = request.reviewedBy
          ? await ctx.db.get(request.reviewedBy)
          : null;

        return {
          ...request,
          requester: requester
            ? {
                _id: requester._id,
                email: requester.email,
                name: requester.name,
              }
            : null,
          reviewer: reviewer
            ? {
                _id: reviewer._id,
                email: reviewer.email,
                name: reviewer.name,
              }
            : null,
        };
      })
    );

    return requestsWithUsers;
  },
});

export const getById = query({
  args: {
    requestId: v.id("environmentVariableRequests"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      return null;
    }

    await getProjectAndOrgRole(ctx, request.projectId, args.userId);

    // Non-reviewers may only view their own requests
    if (
      request.requestedBy !== args.userId &&
      !(await canReviewRequests(ctx, args.userId, request.projectId))
    ) {
      throw new Error("Not authorized to view this request");
    }

    const requester = await ctx.db.get(request.requestedBy);
    const reviewer = request.reviewedBy
      ? await ctx.db.get(request.reviewedBy)
      : null;

    return {
      ...request,
      requester: requester
        ? {
            _id: requester._id,
            email: requester.email,
            name: requester.name,
          }
        : null,
      reviewer: reviewer
        ? {
            _id: reviewer._id,
            email: reviewer.email,
            name: reviewer.name,
          }
        : null,
    };
  },
});

export const create = mutation({
  args: {
    key: v.string(),
    vaultRef: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    projectId: v.id("projects"),
    isSensitive: v.optional(v.boolean()),
    requestedBy: v.id("users"),
  },
  handler: async (ctx, args) => {
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

    const existingVariable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", args.projectId).eq("key", args.key)
      )
      .first();

    if (existingVariable && !existingVariable.deletedAt) {
      throw new Error("Variable key already exists in this project");
    }

    const pendingForKey = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", args.projectId).eq("key", args.key)
      )
      .collect();

    const hasPendingDuplicate = pendingForKey.some(
      (request) =>
        request.requestedBy === args.requestedBy && request.status === "pending"
    );

    if (hasPendingDuplicate) {
      throw new Error(
        "You already have a pending request for this variable key"
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
  },
});

export const review = mutation({
  args: {
    requestId: v.id("environmentVariableRequests"),
    reviewedBy: v.id("users"),
    action: v.union(v.literal("approve"), v.literal("reject")),
    reviewReason: v.optional(v.string()),
    // Reviewer may override the approved environments (approve only).
    environments: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
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
      args.reviewedBy
    );

    // Reviewers: owner, or PM/team lead assigned to the project
    const canReview = await canReviewRequests(
      ctx,
      args.reviewedBy,
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
        reviewedBy: args.reviewedBy,
        reviewedAt: now,
        updatedAt: now,
      });

      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: args.reviewedBy,
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
    const varCount = await countActiveVariables(ctx.db, request.projectId);
    const varCheck = await checkNumericLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      varCount
    );
    if (!varCheck.allowed) {
      throw new Error(varCheck.reason!);
    }

    const existingVariable = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", request.projectId).eq("key", request.key)
      )
      .first();

    if (existingVariable && !existingVariable.deletedAt) {
      throw new Error("Variable key already exists in this project");
    }

    const variableId = await ctx.db.insert("environmentVariables", {
      key: request.key,
      vaultRef: request.vaultRef,
      description: request.description,
      environments: approvedEnvironments,
      projectId: request.projectId,
      isSensitive: request.isSensitive,
      createdBy: args.reviewedBy,
      lastModifiedBy: args.reviewedBy,
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
      changedBy: args.reviewedBy,
      changeReason: `Approved request ${args.requestId}`,
      createdAt: now,
    });

    // The requester (a developer with no blanket write access) keeps write
    // access to the variable they requested via an automatic grant.
    await ctx.db.insert("variablePermissions", {
      variableId,
      userId: request.requestedBy,
      permission: "write",
      grantedBy: args.reviewedBy,
      grantedAt: now,
      isActive: true,
    });

    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewReason: args.reviewReason,
      reviewedBy: args.reviewedBy,
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
      userId: args.reviewedBy,
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
      userId: args.reviewedBy,
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
    canceledBy: v.id("users"),
  },
  handler: async (ctx, args) => {
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

    await getProjectAndOrgRole(ctx, request.projectId, args.canceledBy);

    // The requester may cancel their own request; otherwise the caller
    // must be a reviewer (owner, or assigned PM/team lead)
    const canCancel =
      request.requestedBy === args.canceledBy ||
      (await canReviewRequests(ctx, args.canceledBy, request.projectId));

    if (!canCancel) {
      throw new Error("Not authorized to cancel this request");
    }

    await ctx.db.patch(args.requestId, {
      status: "canceled",
      reviewedBy:
        request.requestedBy === args.canceledBy ? undefined : args.canceledBy,
      reviewedAt: now,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: args.canceledBy,
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
