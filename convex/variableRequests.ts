import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { batchGetUsers } from "./helpers";
import { createAuditLog } from "./auditHelpers";
import { requireAuthedUser, requireBearerUser } from "./identity";
import {
  assertOrgMembership,
  assertProjectAction,
  isEnvironmentScopeAllowed,
} from "./authz";
import { checkCountedLimit, countActiveVariables } from "./featureRegistry";

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
  } catch (err) {
    console.error("variableRequests.canReviewRequests.denied", {
      projectId,
      userId,
      error: String(err),
    });
    return false;
  }
}

async function listForProjectCore(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    userId: Id<"users">;
    status?: "pending" | "approved" | "rejected" | "canceled";
  }
) {
  const { project } = await getProjectAndOrgRole(
    ctx,
    args.projectId,
    args.userId
  );

  // Never .collect() — cap at the most recent 100 requests per project
  // (mirrors listForReviewer's take(100) org-wide cap), newest first via
  // order("desc") on the index. Nothing purges old approved/rejected/
  // canceled requests, so an uncapped read here grows without bound as
  // request history accumulates.
  const requests = args.status
    ? await ctx.db
        .query("environmentVariableRequests")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", project._id).eq("status", args.status!)
        )
        .order("desc")
        .take(100)
    : await ctx.db
        .query("environmentVariableRequests")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .order("desc")
        .take(100);

  // Reviewers (owner, assigned PM/team lead) see every request;
  // everyone else only sees their own.
  const canReview = await canReviewRequests(ctx, args.userId, args.projectId);
  const visibleRequests = canReview
    ? requests
    : requests.filter((request) => request.requestedBy === args.userId);

  // Already newest-first from the index's order("desc") (createdAt is set
  // at insert time and tracks _creationTime, same ordering assumption
  // listForReviewer already relies on) — no separate JS sort needed.
  const sortedRequests = visibleRequests;

  // Dedupe requester/reviewer ids and batch-fetch each unique user exactly
  // once (mirrors listForReviewer's join pattern), instead of two
  // ctx.db.get calls per row — a prolific requester/reviewer no longer
  // costs one read per request they appear on.
  const uniqueUserIds = [
    ...new Set(
      sortedRequests.flatMap((request) =>
        request.reviewedBy
          ? [request.requestedBy, request.reviewedBy]
          : [request.requestedBy]
      )
    ),
  ];
  const userMap = await batchGetUsers(ctx, uniqueUserIds);

  return sortedRequests.map((request) => {
    const requester = userMap.get(request.requestedBy.toString()) ?? null;
    const reviewer = request.reviewedBy
      ? (userMap.get(request.reviewedBy.toString()) ?? null)
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
  });
}

const listForProjectStatusArg = v.optional(
  v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("canceled")
  )
);

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    status: listForProjectStatusArg,
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return listForProjectCore(ctx, {
      projectId: args.projectId,
      userId: actor._id,
      status: args.status,
    });
  },
});

export const listForProjectForToken = query({
  args: {
    accessToken: v.string(),
    projectId: v.id("projects"),
    status: listForProjectStatusArg,
  },
  handler: async (ctx, args) => {
    const actor = await requireBearerUser(ctx, args.accessToken);
    return listForProjectCore(ctx, {
      projectId: args.projectId,
      userId: actor._id,
      status: args.status,
    });
  },
});

async function getByIdCore(
  ctx: QueryCtx,
  args: {
    requestId: Id<"environmentVariableRequests">;
    userId: Id<"users">;
  }
) {
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
}

export const getById = query({
  args: {
    requestId: v.id("environmentVariableRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return getByIdCore(ctx, { requestId: args.requestId, userId: actor._id });
  },
});

export const getByIdForToken = query({
  args: {
    accessToken: v.string(),
    requestId: v.id("environmentVariableRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireBearerUser(ctx, args.accessToken);
    return getByIdCore(ctx, { requestId: args.requestId, userId: actor._id });
  },
});

/**
 * Org-wide "incoming variable requests" feed for reviewers/approvers.
 *
 * FREE-TIER READ COST (worst case, bounded and predictable):
 *   1  membership check      — assertOrgMembership (indexed .first)
 * + 1  memberships list      — projectMembers by_user .collect (owners skip this)
 * + 1  indexed take(100)     — environmentVariableRequests by_organization_and_status
 * + U  unique doc gets       — one ctx.db.get per DISTINCT requester + project
 * Developers short-circuit to [] after the single membership read (they are
 * never reviewers), and no request row is fetched more than once. We never
 * call an assert/permission helper per request row (that would be N reads) —
 * project scoping is done in memory against a Set built from ONE memberships
 * query.
 */
export const listForReviewer = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("canceled")
      )
    ),
  },
  returns: v.array(
    v.object({
      _id: v.id("environmentVariableRequests"),
      _creationTime: v.number(),
      key: v.string(),
      description: v.optional(v.string()),
      environments: v.array(v.string()),
      projectId: v.id("projects"),
      organizationId: v.id("organizations"),
      isSensitive: v.boolean(),
      requestedBy: v.id("users"),
      status: v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("rejected"),
        v.literal("canceled")
      ),
      reviewReason: v.optional(v.string()),
      reviewedBy: v.optional(v.id("users")),
      reviewedAt: v.optional(v.number()),
      createdVariableId: v.optional(v.id("environmentVariables")),
      createdAt: v.number(),
      updatedAt: v.number(),
      // Joined, deduped fields (vaultRef intentionally stripped).
      requester: v.union(
        v.object({
          _id: v.id("users"),
          email: v.string(),
          name: v.optional(v.string()),
        }),
        v.null()
      ),
      projectName: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const status = args.status ?? "pending";

    // 1 read: caller must be an org member. Returns the NORMALIZED role.
    const { membership } = await assertOrgMembership(
      ctx,
      actor._id,
      args.organizationId
    );

    // Developers are never reviewers — bail before touching the request table.
    if (membership.role === "developer") {
      return [];
    }

    // 1 read: newest-first, org + resolved status, hard-capped at 100 rows.
    // Never .collect() here — an org could accumulate unbounded history.
    const requests = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_organization_and_status", (q) =>
        q.eq("organizationId", args.organizationId).eq("status", status)
      )
      .order("desc")
      .take(100);

    // Reviewer scoping. Owners see every org request. project_manager /
    // team_lead only see requests from projects they are ASSIGNED to. Fetch
    // the caller's project memberships ONCE and build a Set of allowed
    // projectIds, then filter in memory — NOT one assertProjectAction per row.
    let scopedRequests = requests;
    if (membership.role !== "owner") {
      const memberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      const allowedProjectIds = new Set(memberships.map((m) => m.projectId));
      scopedRequests = requests.filter((request) =>
        allowedProjectIds.has(request.projectId)
      );
    }

    // Joins without N+1 on duplicates: dedupe requester + project ids, then
    // ctx.db.get each UNIQUE id exactly once.
    const uniqueUserIds = [
      ...new Set(scopedRequests.map((request) => request.requestedBy)),
    ];
    const uniqueProjectIds = [
      ...new Set(scopedRequests.map((request) => request.projectId)),
    ];

    const [users, projects] = await Promise.all([
      Promise.all(uniqueUserIds.map((id) => ctx.db.get(id))),
      Promise.all(uniqueProjectIds.map((id) => ctx.db.get(id))),
    ]);

    const userById = new Map(
      users
        .filter((user): user is NonNullable<typeof user> => user !== null)
        .map((user) => [user._id, user])
    );
    const projectById = new Map(
      projects
        .filter(
          (project): project is NonNullable<typeof project> => project !== null
        )
        .map((project) => [project._id, project])
    );

    return scopedRequests.map((request) => {
      const requester = userById.get(request.requestedBy) ?? null;
      const project = projectById.get(request.projectId) ?? null;

      // Strip vaultRef — the proposed secret ref is fetched only through a
      // separate authorized route, never returned to the approvals list.
      const { vaultRef: _vaultRef, ...rest } = request;

      return {
        ...rest,
        requester: requester
          ? {
              _id: requester._id,
              email: requester.email,
              name: requester.name,
            }
          : null,
        projectName: project?.name ?? "Unknown project",
      };
    });
  },
});

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

export const createForToken = mutation({
  args: {
    accessToken: v.string(),
    ...createRequestArgs,
  },
  handler: async (ctx, args) => {
    const actor = await requireBearerUser(ctx, args.accessToken);
    const { accessToken: _accessToken, ...rest } = args;
    return createCore(ctx, { ...rest, requestedBy: actor._id });
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
