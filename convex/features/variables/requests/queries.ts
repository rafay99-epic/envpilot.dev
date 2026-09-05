import { v, ConvexError } from "convex/values";
import { query, internalQuery, QueryCtx } from "../../../_generated/server";
import { Id } from "../../../_generated/dataModel";
import { batchGetUsers } from "../../../lib/users";
import { requireAuthedUser } from "../../../lib/identity";
import {
  assertOrgMembership,
  normalizeOrgRole,
  getRoleProfile,
  hasCapability,
  bypassesAssignment,
} from "../../../lib/authz";
import { getProjectAndOrgRole, canReviewRequests } from "./helpers";

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

/**
 * Pending request count for a project's sidebar badge. Same access guard AND
 * visibility scoping as listForProject: org membership via
 * getProjectAndOrgRole, then reviewers (owner / assigned PM / team lead) see
 * every pending request while everyone else only counts their own — nobody
 * gets a badge number that reveals more than the list page would show them.
 */
export const pendingCountForProject = query({
  args: {
    projectId: v.id("projects"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { project } = await getProjectAndOrgRole(
      ctx,
      args.projectId,
      actor._id
    );

    const pending = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", project._id).eq("status", "pending")
      )
      .collect();

    const canReview = await canReviewRequests(ctx, actor._id, project._id);
    const visible = canReview
      ? pending
      : pending.filter((request) => request.requestedBy === actor._id);

    return visible.length;
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
    throw new ConvexError("Not authorized to view this request");
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

/**
 * Status of a request named in a notification link, or null when the id is
 * malformed, gone, or outside what the caller may review. Never throws past
 * the auth check: the inbox uses it to pick a tab, and a stale link must not
 * take the page down.
 */
export const statusForLink = query({
  args: { requestId: v.string() },
  returns: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("canceled"),
    v.null()
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const id = ctx.db.normalizeId(
      "environmentVariableRequests",
      args.requestId
    );
    const request = id ? await ctx.db.get(id) : null;
    if (!request) return null;
    // Reviewer-only on purpose: the inbox is the only caller, and a requester
    // who has since left the organization gets nothing.
    const allowed = await canReviewRequests(ctx, actor._id, request.projectId);
    return allowed ? request.status : null;
  },
});

export const getById = query({
  args: {
    requestId: v.id("environmentVariableRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
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
      requestedByKeyId: v.optional(v.id("apiKeys")),
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
      // Who reviewed a resolved request — the org page shows "by <reviewer>"
      // on the Approved/Rejected/Canceled tabs.
      reviewer: v.union(
        v.object({
          _id: v.id("users"),
          email: v.string(),
          name: v.optional(v.string()),
        }),
        v.null()
      ),
      projectName: v.string(),
      // Machine provenance: the API key that filed the request (null for
      // human requests) — the UI renders it with an automated-origin badge.
      requestedByKeyName: v.union(v.string(), v.null()),
      // false = valueless (machine) request: the approver supplies the value.
      hasValue: v.boolean(),
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
    const reviewerProfile = await getRoleProfile(ctx, membership.role);
    if (!hasCapability(reviewerProfile, "project.requests.review")) {
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

    // Reviewer scoping. The owner class sees every org request; every other
    // reviewer only sees requests from projects they are ASSIGNED to. Fetch
    // the caller's project memberships ONCE and build a Set of allowed
    // projectIds, then filter in memory — NOT one assertProjectAction per row.
    let scopedRequests = requests;
    if (!bypassesAssignment(reviewerProfile)) {
      const memberships = await ctx.db
        .query("projectMembers")
        .withIndex("by_user", (q) => q.eq("userId", actor._id))
        .collect();
      const allowedProjectIds = new Set(memberships.map((m) => m.projectId));
      scopedRequests = requests.filter((request) =>
        allowedProjectIds.has(request.projectId)
      );
    }

    // Joins without N+1 on duplicates: dedupe requester + reviewer + project
    // ids, then ctx.db.get each UNIQUE id exactly once.
    const uniqueUserIds = [
      ...new Set(
        scopedRequests.flatMap((request) =>
          request.reviewedBy
            ? [request.requestedBy, request.reviewedBy]
            : [request.requestedBy]
        )
      ),
    ];
    const uniqueProjectIds = [
      ...new Set(scopedRequests.map((request) => request.projectId)),
    ];
    const uniqueKeyIds = [
      ...new Set(
        scopedRequests.flatMap((request) =>
          request.requestedByKeyId ? [request.requestedByKeyId] : []
        )
      ),
    ];

    const [users, projects, keys] = await Promise.all([
      Promise.all(uniqueUserIds.map((id) => ctx.db.get(id))),
      Promise.all(uniqueProjectIds.map((id) => ctx.db.get(id))),
      Promise.all(uniqueKeyIds.map((id) => ctx.db.get(id))),
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
    const keyById = new Map(
      keys
        .filter((key): key is NonNullable<typeof key> => key !== null)
        .map((key) => [key._id, key])
    );

    return scopedRequests.map((request) => {
      const requester = userById.get(request.requestedBy) ?? null;
      const reviewer = request.reviewedBy
        ? (userById.get(request.reviewedBy) ?? null)
        : null;
      const project = projectById.get(request.projectId) ?? null;

      // Strip vaultRef — the proposed secret ref is fetched only through a
      // separate authorized route, never returned to the approvals list.
      const { vaultRef: _vaultRef, ...rest } = request;

      return {
        ...rest,
        requestedByKeyName: request.requestedByKeyId
          ? (keyById.get(request.requestedByKeyId)?.name ?? "deleted key")
          : null,
        hasValue: request.vaultRef !== undefined,
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
        projectName: project?.name ?? "Unknown project",
      };
    });
  },
});

/**
 * Internal: resolve the email recipients who can review requests for a project
 * — the org owner(s) plus project managers / team leads ASSIGNED to the
 * project (mirrors canReviewRequests' role model). Deduped by email and bounded
 * so a huge org can't fan out an unbounded send. Used by the request-created
 * notification action; returns [] for a missing/deleted project.
 */
export const getRequestReviewerRecipients = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({ email: v.string(), name: v.optional(v.string()) })
  ),
  handler: async (ctx, args) => {
    const MAX_RECIPIENTS = 25;
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];

    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", project.organizationId)
      )
      .collect();

    const assigned = await ctx.db
      .query("projectMembers")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    const assignedUserIds = new Set(assigned.map((m) => m.userId.toString()));

    const recipients: { email: string; name?: string }[] = [];
    const seenEmails = new Set<string>();
    const recipientProfileMemo = new Map<
      string,
      Awaited<ReturnType<typeof getRoleProfile>>
    >();
    for (const member of members) {
      const role = normalizeOrgRole(member.role);
      let recipientProfile = recipientProfileMemo.get(role);
      if (!recipientProfile) {
        recipientProfile = await getRoleProfile(ctx, role);
        recipientProfileMemo.set(role, recipientProfile);
      }
      const isReviewer =
        bypassesAssignment(recipientProfile) ||
        (hasCapability(recipientProfile, "project.requests.review") &&
          assignedUserIds.has(member.userId.toString()));
      if (!isReviewer) continue;

      const user = await ctx.db.get(member.userId);
      if (!user?.email) continue;
      const key = user.email.toLowerCase();
      if (seenEmails.has(key)) continue;
      seenEmails.add(key);
      recipients.push({ email: user.email, name: user.name });
      if (recipients.length >= MAX_RECIPIENTS) break;
    }
    return recipients;
  },
});
