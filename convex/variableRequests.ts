import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { createAuditLog } from "./auditHelpers";

type MembershipRole = "admin" | "team_lead" | "member";

async function getProjectAndMembership(
  ctx: MutationCtx | QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
) {
  const project = await ctx.db.get(projectId);
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  const membership = await ctx.db
    .query("organizationMembers")
    .withIndex("by_org_and_user", (q) =>
      q.eq("organizationId", project.organizationId).eq("userId", userId)
    )
    .first();

  if (!membership) {
    throw new Error("Not a member of this organization");
  }

  return {
    project,
    membership: membership as typeof membership & { role: MembershipRole },
  };
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
    const { project, membership } = await getProjectAndMembership(
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

    const visibleRequests =
      membership.role === "member"
        ? requests.filter((request) => request.requestedBy === args.userId)
        : requests;

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

    const { membership } = await getProjectAndMembership(
      ctx,
      request.projectId,
      args.userId
    );

    if (membership.role === "member" && request.requestedBy !== args.userId) {
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

    const { project, membership } = await getProjectAndMembership(
      ctx,
      args.projectId,
      args.requestedBy
    );

    if (membership.role !== "member") {
      throw new Error("Only members can create variable requests");
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

    const { project, membership } = await getProjectAndMembership(
      ctx,
      request.projectId,
      args.reviewedBy
    );

    if (membership.role !== "admin" && membership.role !== "team_lead") {
      throw new Error(
        "Only admins and team leads can review variable requests"
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
      environments: request.environments,
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
      environments: request.environments,
      changedBy: args.reviewedBy,
      changeReason: `Approved request ${args.requestId}`,
      createdAt: now,
    });

    await ctx.db.patch(args.requestId, {
      status: "approved",
      reviewReason: args.reviewReason,
      reviewedBy: args.reviewedBy,
      reviewedAt: now,
      createdVariableId: variableId,
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
        environments: request.environments,
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

    const { membership } = await getProjectAndMembership(
      ctx,
      request.projectId,
      args.canceledBy
    );

    const canCancel =
      request.requestedBy === args.canceledBy ||
      membership.role === "admin" ||
      membership.role === "team_lead";

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
