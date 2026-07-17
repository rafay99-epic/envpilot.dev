import { v } from "convex/values";
import { query } from "../../../_generated/server";
import { batchGetUsers } from "../../../lib/users";
import { requireAuthedUser } from "../../../lib/identity";
import { getProjectAndOrgRole, canReviewAccountRequests } from "./helpers";

/**
 * Account request queries — mirror of the variable-request queries
 * (convex/features/variables/requests/queries.ts): same visibility model
 * (reviewers see every request, everyone else only their own), same
 * take(100) bound, same deduped requester/reviewer join.
 */

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
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
    const actor = await requireAuthedUser(ctx);
    const { project } = await getProjectAndOrgRole(
      ctx,
      args.projectId,
      actor._id
    );

    // Never .collect() — cap at the most recent 100 requests per project,
    // newest first (nothing purges resolved request history).
    const requests = args.status
      ? await ctx.db
          .query("accountRequests")
          .withIndex("by_project_and_status", (q) =>
            q.eq("projectId", project._id).eq("status", args.status!)
          )
          .order("desc")
          .take(100)
      : await ctx.db
          .query("accountRequests")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .order("desc")
          .take(100);

    // Reviewers (owner, assigned PM/team lead) see every request;
    // everyone else only sees their own.
    const canReview = await canReviewAccountRequests(
      ctx,
      actor._id,
      args.projectId
    );
    const visibleRequests = canReview
      ? requests
      : requests.filter((request) => request.requestedBy === actor._id);

    const uniqueUserIds = [
      ...new Set(
        visibleRequests.flatMap((request) =>
          request.reviewedBy
            ? [request.requestedBy, request.reviewedBy]
            : [request.requestedBy]
        )
      ),
    ];
    const userMap = await batchGetUsers(ctx, uniqueUserIds);

    return visibleRequests.map((request) => {
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
  },
});

/**
 * Pending account-request count for the project's sidebar badge. Same access
 * guard AND visibility scoping as listForProject (mirror of the variable
 * flow's pendingCountForProject).
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
      .query("accountRequests")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", project._id).eq("status", "pending")
      )
      .collect();

    const canReview = await canReviewAccountRequests(
      ctx,
      actor._id,
      project._id
    );
    const visible = canReview
      ? pending
      : pending.filter((request) => request.requestedBy === actor._id);

    return visible.length;
  },
});
