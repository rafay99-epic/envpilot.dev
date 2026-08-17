import { v } from "convex/values";
import {
  internalMutation,
  query,
  type MutationCtx,
} from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { assertProjectAction } from "../../lib/authz";

/**
 * Progress for pooled vault operations: template provisioning, import, export.
 *
 * Why this exists rather than the workflow component's own status: that
 * reports which STEP is running, not how many items inside a step have
 * landed, so it cannot say "31 of 48". Import and export additionally never
 * run as workflows at all — their items carry secret plaintext and a workflow
 * journal persists step arguments.
 *
 * Counts only. Nothing here identifies a variable, so a leaked row tells an
 * attacker how many things happened and nothing about what they were.
 */

export const bulkJobKind = v.union(
  v.literal("template"),
  v.literal("import"),
  v.literal("export")
);

/** Open a job row. Caller has already authorized the operation. */
export async function openBulkJob(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    kind: "template" | "import" | "export";
    total: number;
    createdBy: Id<"users">;
  }
): Promise<Id<"bulkJobs">> {
  return ctx.db.insert("bulkJobs", {
    ...args,
    status: "running",
    completed: 0,
    failed: 0,
    startedAt: Date.now(),
  });
}

/**
 * Advance the counters. Called from a pooled action on a throttle, so it is
 * deliberately cheap and deliberately not authorizing: the job row is opened
 * by an authorized caller and its id never leaves the server.
 *
 * Monotonic: a late report from a slower worker cannot walk the count
 * backwards, which would make the bar jump around.
 */
export const _progress = internalMutation({
  args: {
    jobId: v.id("bulkJobs"),
    completed: v.number(),
    failed: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "running") return null;
    await ctx.db.patch(args.jobId, {
      completed: Math.max(job.completed, args.completed),
      failed: Math.max(job.failed, args.failed ?? 0),
    });
    return null;
  },
});

export const _finish = internalMutation({
  args: {
    jobId: v.id("bulkJobs"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    completed: v.optional(v.number()),
    failed: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    await ctx.db.patch(args.jobId, {
      status: args.status,
      completed: args.completed ?? job.completed,
      failed: args.failed ?? job.failed,
      error: args.error,
      finishedAt: Date.now(),
    });
    return null;
  },
});

/**
 * The project's most recent bulk job, for the progress UI.
 *
 * Reactive: the page subscribes once and Convex pushes each counter bump. No
 * polling, and no refetch-after-mutate to get wrong.
 */
export const latestForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("bulkJobs"),
      kind: bulkJobKind,
      status: v.union(
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      ),
      total: v.number(),
      completed: v.number(),
      failed: v.number(),
      error: v.optional(v.string()),
      startedAt: v.number(),
      finishedAt: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    // Same gate as opening the project: someone who cannot see the project
    // must not learn how many variables are being written into it.
    await assertProjectAction(ctx, actor._id, args.projectId, "project:read");

    const job = await ctx.db
      .query("bulkJobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .first();
    if (!job) return null;

    return {
      _id: job._id,
      kind: job.kind,
      status: job.status,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      error: job.error,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
    };
  },
});
