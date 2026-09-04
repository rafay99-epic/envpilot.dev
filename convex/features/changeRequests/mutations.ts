import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { createAuditLog } from "../../lib/audit";
import { rateLimiter } from "../../lib/rateLimits";
import {
  assertProjectAction,
  assertProjectCapability,
  bypassesAssignment,
  getRoleProfile,
  hasCapability,
  isEnvironmentScopeAllowed,
  normalizeOrgRole,
} from "../../lib/authz";
import {
  protectedEnvironmentsIn,
  touchedEnvironments,
} from "../../lib/protection";
import {
  allowlistPayload,
  applyChangeRequest,
  payloadEnvironments,
  payloadTargetVersion,
} from "./apply";
import {
  assertCouldWriteDirectly,
  type ChangeKind,
  type ResourceType,
} from "./authorize";

/**
 * Change requests: the proposal side of protected environments.
 *
 * A write that touches a protected environment is refused by
 * lib/protection.ts and filed here instead. A second person reviews it, and
 * `review` replays the proposal through the ordinary resource cores with
 * `viaRequestId` set, so every domain rule (uniqueness, tier limits,
 * versioning, audit) runs exactly once and in one place.
 */

const VALID_ENVIRONMENTS = ["development", "staging", "production"];

/** Standing-state cap: one requester may not pile up pendings on a project. */
const MAX_PENDING_PER_REQUESTER = 50;
const STALE_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_REMINDER_MS = 48 * 60 * 60 * 1000;
const SWEEP_BATCH = 100;
const MAX_APPROVER_RECIPIENTS = 25;
/** Rows read per table when resolving approvers. */
const MAX_APPROVER_SCAN = 200;
/** Rows re-tenanted per pass after a project moves organization. */
const RETENANT_BATCH = 200;
const RETENANT_STATUSES = [
  "pending",
  "applied",
  "rejected",
  "canceled",
  "expired",
] as const;

const resourceTypeValidator = v.union(
  v.literal("variable"),
  v.literal("account"),
  v.literal("file")
);

const kindValidator = v.union(
  v.literal("create"),
  v.literal("update"),
  v.literal("delete"),
  v.literal("restore"),
  v.literal("rollback")
);

const sourceValidator = v.union(
  v.literal("web"),
  v.literal("cli"),
  v.literal("mcp"),
  v.literal("extension")
);

/**
 * The target's version right now, whatever kind of resource it is. Null when
 * the target is gone (or was never named), which reads as stale.
 */
async function currentTargetVersion(
  ctx: MutationCtx,
  request: Doc<"changeRequests">
): Promise<number | null> {
  const targetId = request.targetId;
  if (targetId === undefined) return null;

  if (request.resourceType === "account") {
    const id = ctx.db.normalizeId("projectAccounts", targetId);
    return (id ? await ctx.db.get(id) : null)?.version ?? null;
  }
  if (request.resourceType === "file") {
    const id = ctx.db.normalizeId("projectFiles", targetId);
    return (id ? await ctx.db.get(id) : null)?.version ?? null;
  }
  const id = ctx.db.normalizeId("environmentVariables", targetId);
  return (id ? await ctx.db.get(id) : null)?.version ?? null;
}

/**
 * Everyone who may apply a change request on this project: org members
 * holding project.protection.approve who either bypass assignment (owner
 * class) or are assigned to the project.
 */
async function resolveApprovers(
  ctx: MutationCtx,
  project: Doc<"projects">
): Promise<Array<{ email: string; name?: string }>> {
  // Bounded scans: this runs on every create and once per idle request in
  // the reminder sweep, so an unbounded org read would dominate both.
  const members = await ctx.db
    .query("organizationMembers")
    .withIndex("by_organization", (q) =>
      q.eq("organizationId", project.organizationId)
    )
    .take(MAX_APPROVER_SCAN);

  const assigned = await ctx.db
    .query("projectMembers")
    .withIndex("by_project", (q) => q.eq("projectId", project._id))
    .take(MAX_APPROVER_SCAN);
  const assignedUserIds = new Set(assigned.map((m) => m.userId.toString()));

  const recipients: Array<{ email: string; name?: string }> = [];
  const seenEmails = new Set<string>();
  const profileMemo = new Map<
    string,
    Awaited<ReturnType<typeof getRoleProfile>>
  >();

  for (const member of members) {
    const role = normalizeOrgRole(member.role);
    let profile = profileMemo.get(role);
    if (!profile) {
      profile = await getRoleProfile(ctx, role);
      profileMemo.set(role, profile);
    }
    if (!hasCapability(profile, "project.protection.approve")) continue;
    if (
      !bypassesAssignment(profile) &&
      !assignedUserIds.has(member.userId.toString())
    ) {
      continue;
    }

    const user = await ctx.db.get(member.userId);
    if (!user?.email) continue;
    const key = user.email.toLowerCase();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    recipients.push({ email: user.email, name: user.name });
    if (recipients.length >= MAX_APPROVER_RECIPIENTS) break;
  }

  return recipients;
}

/**
 * Destroy the secret material a rejected/canceled/expired proposal staged.
 * The vault object is deleted through the scheduler (action-only); the blob
 * goes immediately. Both are best-effort — vaultGc reconciles stragglers.
 */
async function purgeStaged(
  ctx: MutationCtx,
  staged: { vaultRef?: string; storageId?: Id<"_storage"> }
): Promise<void> {
  if (staged.vaultRef !== undefined) {
    await ctx.scheduler.runAfter(
      0,
      internal.features.vault.vault.deleteSecret,
      { vaultRef: staged.vaultRef }
    );
  }
  if (staged.storageId !== undefined) {
    await ctx.storage.delete(staged.storageId).catch(() => {});
  }
}

/**
 * Cancel ONE pending proposal: mark it, destroy the secret material it
 * staged, and record why. Callable in-transaction from any path that makes
 * the proposal unapplyable (target deleted, project moved).
 */
export async function cancelPendingRequest(
  ctx: MutationCtx,
  request: Doc<"changeRequests">,
  actorId: Id<"users"> | undefined,
  reason: string
): Promise<void> {
  const now = Date.now();
  await ctx.db.patch(request._id, {
    status: "canceled",
    reviewReason: reason,
    reviewedBy: actorId,
    reviewedAt: now,
    updatedAt: now,
  });
  await purgeStaged(ctx, request);
  await createAuditLog(ctx, {
    organizationId: request.organizationId,
    projectId: request.projectId,
    userId: actorId ?? request.requestedBy,
    action: "change.canceled",
    details: {
      requestId: request._id,
      resourceType: request.resourceType,
      kind: request.kind,
      environments: request.environments,
      label: request.label,
      targetId: request.targetId,
      reason,
    },
  });
}

/**
 * Cancel every pending proposal aimed at a resource that just went away.
 * Callable in-transaction from the resource's own delete path.
 * `exceptRequestId` skips the request currently being applied, whose status
 * the reviewer is about to set.
 */
export async function cancelPendingForTarget(
  ctx: MutationCtx,
  targetId: string,
  actorId: Id<"users"> | undefined,
  reason: string,
  exceptRequestId?: Id<"changeRequests">
): Promise<number> {
  const pending = await ctx.db
    .query("changeRequests")
    .withIndex("by_target_status", (q) =>
      q.eq("targetId", targetId).eq("status", "pending")
    )
    .take(SWEEP_BATCH);

  let canceled = 0;
  for (const request of pending) {
    if (exceptRequestId !== undefined && request._id === exceptRequestId) {
      continue;
    }
    await cancelPendingRequest(ctx, request, actorId, reason);
    canceled++;
  }
  return canceled;
}

/**
 * What every filing surface supplies. `environments` is advisory: the stored
 * set is derived from the target row and the payload, so what a reviewer is
 * shown is what apply writes.
 */
const changeRequestArgs = {
  projectId: v.id("projects"),
  resourceType: resourceTypeValidator,
  kind: kindValidator,
  targetId: v.optional(v.string()),
  environments: v.optional(v.array(v.string())),
  payload: v.string(),
  label: v.string(),
  reason: v.optional(v.string()),
  source: sourceValidator,
};

type FileChangeRequestArgs = {
  projectId: Id<"projects">;
  resourceType: ResourceType;
  kind: ChangeKind;
  targetId?: string;
  payload: string;
  label: string;
  reason?: string;
  source: "web" | "cli" | "mcp" | "extension";
  /** Staged secret material. Minted by an action, never client-supplied. */
  vaultRef?: string;
  storageId?: Id<"_storage">;
};

async function fileChangeRequest(
  ctx: MutationCtx,
  args: FileChangeRequestArgs
): Promise<Id<"changeRequests">> {
  const actor = await requireAuthedUser(ctx);

  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new ConvexError("Project not found");
  }

  // Everyone filing a request must at least be able to read the project;
  // this also resolves the environment scope used below.
  const { environmentScope } = await assertProjectAction(
    ctx,
    actor._id,
    args.projectId,
    "project:read",
    project
  );

  // Allowlisted, never stored raw: the payload is re-serialized down to the
  // non-secret fields its resource type declares. `create` is a public
  // mutation, so an arbitrary string here would otherwise be handed straight
  // back to every reader of the request.
  const payload = allowlistPayload(args.resourceType, args.payload);

  const targetId = args.targetId;

  // A create names no row yet, and lib/protection.ts binds the applied write
  // to the id the request stores: a create carrying one would describe a
  // change it does not authorize.
  if (args.kind === "create" && targetId !== undefined) {
    throw new ConvexError("A create request cannot name a target");
  }

  const { target, currentEnvironments } = await assertCouldWriteDirectly(
    ctx,
    actor._id,
    project,
    {
      resourceType: args.resourceType,
      kind: args.kind,
      targetId,
      targetVersion: payloadTargetVersion(payload),
    }
  );

  // Derived, never declared: the union of what the write starts from and
  // what the payload proposes. A client cannot describe one change and have
  // another applied.
  const environments = touchedEnvironments(
    currentEnvironments,
    payloadEnvironments(payload)
  );
  if (environments.length === 0) {
    throw new ConvexError(
      "This change request does not name the environments it touches"
    );
  }
  for (const environment of environments) {
    if (!VALID_ENVIRONMENTS.includes(environment)) {
      throw new ConvexError(
        `Invalid environment "${environment}". Allowed: ${VALID_ENVIRONMENTS.join(", ")}`
      );
    }
  }

  if (!isEnvironmentScopeAllowed(environmentScope, environments)) {
    throw new ConvexError(
      `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
    );
  }

  // A change request exists only to unblock a protected write. Anything
  // else belongs on the direct path, where it is applied immediately.
  const protectedEnvs = protectedEnvironmentsIn(project, environments);
  if (protectedEnvs.length === 0) {
    throw new ConvexError(
      "This change does not touch a protected environment — make it directly"
    );
  }

  // Dedupe: one pending proposal per target+kind, and one per label+kind
  // for creates (which have no target yet).
  const duplicate =
    targetId !== undefined
      ? await ctx.db
          .query("changeRequests")
          .withIndex("by_target_status", (q) =>
            q.eq("targetId", targetId).eq("status", "pending")
          )
          .filter((q) => q.eq(q.field("kind"), args.kind))
          .first()
      : await ctx.db
          .query("changeRequests")
          .withIndex("by_project_status", (q) =>
            q.eq("projectId", args.projectId).eq("status", "pending")
          )
          .filter((q) =>
            q.and(
              q.eq(q.field("label"), args.label),
              q.eq(q.field("kind"), args.kind)
            )
          )
          .first();
  // by_target_status is not project- or type-scoped, and the create branch
  // dedupes on label alone, so only a same-project, same-resource row is the
  // proposal this call would have filed.
  if (
    duplicate &&
    duplicate.projectId === args.projectId &&
    duplicate.resourceType === args.resourceType
  ) {
    if (duplicate.requestedBy !== actor._id) {
      throw new ConvexError(
        `There is already a pending ${args.kind} request for ${args.label}. Wait for it to be reviewed, or cancel it first.`
      );
    }
    // The requester's own refile is idempotent, so a partially filed CLI push
    // can be rerun: the standing proposal wins and the material this call
    // staged for it is destroyed rather than orphaned.
    await purgeStaged(ctx, args);
    return duplicate._id;
  }

  const openForRequester = await ctx.db
    .query("changeRequests")
    .withIndex("by_requester_status", (q) =>
      q.eq("requestedBy", actor._id).eq("status", "pending")
    )
    .filter((q) => q.eq(q.field("projectId"), args.projectId))
    .take(MAX_PENDING_PER_REQUESTER);
  if (openForRequester.length >= MAX_PENDING_PER_REQUESTER) {
    throw new ConvexError(
      `You already have ${MAX_PENDING_PER_REQUESTER} pending change requests on this project. Wait for them to be reviewed before filing more.`
    );
  }

  await rateLimiter.limit(ctx, "variableCreate", {
    key: actor._id,
    throws: true,
  });

  const now = Date.now();
  const requestId = await ctx.db.insert("changeRequests", {
    organizationId: project.organizationId,
    projectId: args.projectId,
    resourceType: args.resourceType,
    kind: args.kind,
    targetId: args.targetId,
    // Server-derived too: a client cannot pin the stale check to a version
    // the target has already moved past.
    expectedVersion: target?.version,
    environments,
    payload,
    vaultRef: args.vaultRef,
    storageId: args.storageId,
    label: args.label,
    reason: args.reason,
    requestedBy: actor._id,
    source: args.source,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: args.projectId,
    userId: actor._id,
    action: "change.requested",
    details: {
      requestId,
      resourceType: args.resourceType,
      kind: args.kind,
      environments,
      targetId: args.targetId,
      label: args.label,
      source: args.source,
    },
  });

  const approvers = await resolveApprovers(ctx, project);
  if (approvers.length > 0) {
    await ctx.scheduler.runAfter(
      0,
      internal.features.emails.emails.sendChangeRequestCreatedEmail,
      {
        recipients: approvers.map((a) => a.email),
        projectName: project.name,
        requesterName: actor.name || actor.email,
        label: args.label,
        kind: args.kind,
        environments,
      }
    );
  }

  return requestId;
}

/**
 * File a proposal that carries no secret material of its own (delete,
 * restore, metadata edits). Staged values go through `createStaged`.
 */
export const create = mutation({
  args: changeRequestArgs,
  returns: v.id("changeRequests"),
  handler: async (ctx, args) => fileChangeRequest(ctx, args),
});

/**
 * The same filing, plus the vault object / blob an action minted for it.
 * Internal because a client-supplied ref would let a caller attach secret
 * material it never owned — apply makes that ref the resource's.
 */
export const createStaged = internalMutation({
  args: {
    ...changeRequestArgs,
    vaultRef: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
  },
  returns: v.id("changeRequests"),
  handler: async (ctx, args) => fileChangeRequest(ctx, args),
});

export const review = mutation({
  args: {
    requestId: v.id("changeRequests"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reason: v.optional(v.string()),
  },
  returns: v.union(v.literal("applied"), v.literal("rejected")),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Change request not found");
    }

    const { environmentScope } = await assertProjectCapability(
      ctx,
      actor._id,
      request.projectId,
      "project.protection.approve"
    );

    // An approver scoped away from production must not decide a production
    // change, because approving is a write into an environment they
    // cannot touch.
    if (!isEnvironmentScopeAllowed(environmentScope, request.environments)) {
      throw new ConvexError(
        `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
      );
    }

    if (request.status !== "pending") {
      throw new ConvexError(
        `This change request has already been ${request.status}`
      );
    }
    if (request.requestedBy === actor._id) {
      throw new ConvexError("You cannot approve your own change request");
    }

    const project = await ctx.db.get(request.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const now = Date.now();

    if (args.decision === "reject") {
      await ctx.db.patch(args.requestId, {
        status: "rejected",
        reviewedBy: actor._id,
        reviewedAt: now,
        reviewReason: args.reason,
        updatedAt: now,
      });
      await purgeStaged(ctx, request);
      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: actor._id,
        action: "change.rejected",
        details: {
          requestId: args.requestId,
          resourceType: request.resourceType,
          kind: request.kind,
          environments: request.environments,
          label: request.label,
          targetId: request.targetId,
          reason: args.reason,
        },
      });
      await notifyRequester(
        ctx,
        request,
        project,
        actor,
        "rejected",
        args.reason
      );
      return "rejected";
    }

    // Stale check: the resource must not have moved under the proposal.
    if (
      request.targetId !== undefined &&
      request.expectedVersion !== undefined
    ) {
      const version = await currentTargetVersion(ctx, request);
      if (version !== request.expectedVersion) {
        throw new ConvexError(
          "This resource changed after the request was filed. Ask the requester to file it again."
        );
      }
    }

    const appliedResourceId = await applyChangeRequest(ctx, request, actor._id);

    await ctx.db.patch(args.requestId, {
      status: "applied",
      appliedResourceId,
      reviewedBy: actor._id,
      reviewedAt: now,
      reviewReason: args.reason,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: actor._id,
      action: "change.applied",
      details: {
        requestId: args.requestId,
        resourceType: request.resourceType,
        kind: request.kind,
        environments: request.environments,
        label: request.label,
        targetId: request.targetId,
        appliedResourceId,
        reviewedBy: actor._id,
        reason: args.reason,
      },
    });

    await notifyRequester(ctx, request, project, actor, "applied", args.reason);
    return "applied";
  },
});

async function notifyRequester(
  ctx: MutationCtx,
  request: Doc<"changeRequests">,
  project: Doc<"projects">,
  reviewer: Doc<"users">,
  verdict: "applied" | "rejected",
  reason: string | undefined
): Promise<void> {
  const requester = await ctx.db.get(request.requestedBy);
  if (!requester?.email) return;
  await ctx.scheduler.runAfter(
    0,
    internal.features.emails.emails.sendChangeRequestReviewedEmail,
    {
      to: requester.email,
      label: request.label,
      projectName: project.name,
      verdict,
      reviewerName: reviewer.name || reviewer.email,
      reason,
    }
  );
}

export const cancel = mutation({
  args: { requestId: v.id("changeRequests") },
  returns: v.id("changeRequests"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Change request not found");
    }
    if (request.requestedBy !== actor._id) {
      await assertProjectCapability(
        ctx,
        actor._id,
        request.projectId,
        "project.protection.approve"
      );
    }
    if (request.status !== "pending") {
      throw new ConvexError(
        `Only pending change requests can be canceled (current: ${request.status})`
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.requestId, {
      status: "canceled",
      reviewedBy: request.requestedBy === actor._id ? undefined : actor._id,
      reviewedAt: now,
      updatedAt: now,
    });
    await purgeStaged(ctx, request);
    await createAuditLog(ctx, {
      organizationId: request.organizationId,
      projectId: request.projectId,
      userId: actor._id,
      action: "change.canceled",
      details: {
        requestId: args.requestId,
        resourceType: request.resourceType,
        kind: request.kind,
        environments: request.environments,
        label: request.label,
        targetId: request.targetId,
      },
    });

    return args.requestId;
  },
});

export const cancelForTarget = internalMutation({
  args: { targetId: v.string(), reason: v.string() },
  returns: v.number(),
  handler: async (ctx, args) =>
    cancelPendingForTarget(ctx, args.targetId, undefined, args.reason),
});

/**
 * Move a project's change-request history to the project's new organization,
 * a batch at a time. The move mutation schedules this instead of patching an
 * unbounded inbox inside its own transaction; each pass patches only rows
 * still carrying the old org, so it reschedules itself until none remain.
 */
/**
 * Patch organizationId onto up to `max` rows of a moved project that still
 * carry the source organization. Returns how many were patched; a full batch
 * means more may remain.
 */
export async function retenantChangeRequestsBatch(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  organizationId: Id<"organizations">,
  max: number
): Promise<number> {
  let patched = 0;
  for (const status of RETENANT_STATUSES) {
    if (patched >= max) break;
    const stale = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", projectId).eq("status", status)
      )
      .filter((q) => q.neq(q.field("organizationId"), organizationId))
      .take(max - patched);
    for (const request of stale) {
      await ctx.db.patch(request._id, { organizationId });
      patched++;
    }
  }
  return patched;
}

export const retenantChangeRequests = internalMutation({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    // A later move already superseded this pass; its own chain owns the rows.
    if (!project || project.organizationId !== args.organizationId) return 0;

    const patched = await retenantChangeRequestsBatch(
      ctx,
      args.projectId,
      args.organizationId,
      RETENANT_BATCH
    );
    // A short pass means every status range was exhausted: nothing is left.
    if (patched >= RETENANT_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.changeRequests.mutations.retenantChangeRequests,
        args
      );
    }
    return patched;
  },
});

/**
 * TTL sweep (cron): a proposal nobody reviewed in 30 days is dead. Expiring
 * it destroys the staged secret and clears the reviewer feed.
 */
export const expireStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - STALE_MS;
    const stale = await ctx.db
      .query("changeRequests")
      .withIndex("by_status_created", (q) =>
        q.eq("status", "pending").lt("createdAt", cutoff)
      )
      .take(SWEEP_BATCH);

    const now = Date.now();
    for (const request of stale) {
      await ctx.db.patch(request._id, {
        status: "expired",
        reviewReason: "Auto-expired: pending for more than 30 days",
        updatedAt: now,
      });
      await purgeStaged(ctx, request);
      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: request.requestedBy,
        action: "change.expired",
        details: {
          requestId: request._id,
          resourceType: request.resourceType,
          kind: request.kind,
          label: request.label,
          environments: request.environments,
        },
      });
    }
    return stale.length;
  },
});

/**
 * One-shot 48h nudge (cron): reminderSentAt is the idempotency marker, so a
 * proposal never mails its approvers twice no matter how often this runs.
 */
export const sendIdleReminders = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - IDLE_REMINDER_MS;
    const idle = await ctx.db
      .query("changeRequests")
      .withIndex("by_status_created", (q) =>
        q.eq("status", "pending").lt("createdAt", cutoff)
      )
      .filter((q) => q.eq(q.field("reminderSentAt"), undefined))
      .take(SWEEP_BATCH);

    const now = Date.now();
    let reminded = 0;
    for (const request of idle) {
      const project = await ctx.db.get(request.projectId);
      if (!project || project.deletedAt) continue;

      const approvers = await resolveApprovers(ctx, project);
      if (approvers.length > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.features.emails.emails.sendChangeRequestReminderEmail,
          {
            recipients: approvers.map((a) => a.email),
            projectName: project.name,
            label: request.label,
            ageHours: Math.floor((now - request.createdAt) / (60 * 60 * 1000)),
          }
        );
      }

      await ctx.db.patch(request._id, { reminderSentAt: now, updatedAt: now });
      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: request.requestedBy,
        action: "change.reminder_sent",
        details: {
          requestId: request._id,
          label: request.label,
          environments: request.environments,
          recipients: approvers.length,
        },
      });
      reminded++;
    }
    return reminded;
  },
});
