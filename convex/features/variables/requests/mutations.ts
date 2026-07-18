import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  MutationCtx,
} from "../../../_generated/server";
import { internal } from "../../../_generated/api";
import {
  findEnvironmentConflicts,
  environmentConflictMessage,
} from "../helpers";
import { Id, Doc } from "../../../_generated/dataModel";
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
 * Validate an environment list: non-empty, known names, no duplicates.
 * Used for BOTH the reviewer's approve-time override AND every request
 * create path (insertRequest) — an unknown environment name inserted here
 * would make the request unapprovable (the override validation rejects it)
 * or, worse, create a variable tagged with a nonexistent environment.
 */
function assertValidEnvironments(environments: string[]): void {
  if (environments.length === 0) {
    throw new ConvexError("At least one environment is required");
  }

  const seen = new Set<string>();
  for (const environment of environments) {
    if (!(VALID_ENVIRONMENTS as readonly string[]).includes(environment)) {
      throw new ConvexError(
        `Invalid environment "${environment}". Allowed: ${VALID_ENVIRONMENTS.join(", ")}`
      );
    }
    if (seen.has(environment)) {
      throw new ConvexError(`Duplicate environment "${environment}"`);
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

// Same rule the web route's zod schema enforces — applied here so EVERY
// entry point (web, CLI/extension action, machine) ships identical keys.
const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function assertValidRequestInput(key: string, description?: string): void {
  if (!KEY_PATTERN.test(key) || key.length > 100) {
    throw new ConvexError(
      "Variable key must be UPPER_SNAKE_CASE (A-Z, 0-9, _), start with a letter, and be at most 100 characters"
    );
  }
  if (description !== undefined && description.length > 500) {
    throw new ConvexError("Description must be at most 500 characters");
  }
}

/**
 * Shared tail of request creation — conflict check, duplicate guard,
 * insert, audit, reviewer email. Both the human path (createCore, which
 * authorizes the USER) and the machine path (_createFromKey, which
 * authorizes the KEY) end here, so the per-(key, environment) uniqueness
 * invariant is enforced once and cannot fork.
 */
async function insertRequest(
  ctx: MutationCtx,
  args: {
    key: string;
    vaultRef?: string;
    description?: string;
    environments: string[];
    projectId: Id<"projects">;
    isSensitive: boolean;
    requestedBy: Id<"users">;
    requestedByKeyId?: Id<"apiKeys">;
    requesterLabel: string;
  }
) {
  const now = Date.now();
  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new ConvexError("Project not found");
  }

  assertValidRequestInput(args.key, args.description);
  assertValidEnvironments(args.environments);

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

  // Machine dedupe ignores WHO filed it: an agent gains nothing from a
  // second identical pending request, and per-requester dedupe would let
  // key rotation bypass the guard. Humans keep per-requester dedupe (two
  // developers may legitimately race the same key; the reviewer resolves).
  const hasPendingDuplicate = pendingForKey.some(
    (request) =>
      request.status === "pending" &&
      (args.requestedByKeyId !== undefined ||
        request.requestedBy === args.requestedBy) &&
      // A pending request for DISJOINT environments is a different variable.
      request.environments.some((env) => args.environments.includes(env))
  );

  if (hasPendingDuplicate) {
    // Keep the phrase "pending request" — the CLI/extension/web API routes
    // match on it to map this rejection to HTTP 409.
    throw new ConvexError(
      `There is already a pending request for "${args.key}". Wait for it to be reviewed, or cancel it before requesting again.`
    );
  }

  const requestId = await ctx.db.insert("environmentVariableRequests", {
    key: args.key,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    projectId: args.projectId,
    organizationId: project.organizationId,
    isSensitive: args.isSensitive,
    requestedBy: args.requestedBy,
    requestedByKeyId: args.requestedByKeyId,
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
      isSensitive: args.isSensitive,
      ...(args.requestedByKeyId !== undefined && {
        requestedByKeyId: args.requestedByKeyId,
        requesterLabel: args.requesterLabel,
        source: "machine",
      }),
    },
    resourceType: "variable",
    involvesSensitiveData: args.isSensitive,
  });

  // Notify the project's reviewers (owner + assigned PMs/team leads) that a
  // request arrived. Scheduled + best-effort — a send failure must never
  // block or undo the request. Machine volume is bounded by the per-key
  // rate limit + open-pendings cap, so per-request emails cannot flood.
  await ctx.scheduler.runAfter(
    0,
    internal.features.emails.emails.sendVariableRequestCreatedEmail,
    {
      projectId: args.projectId,
      projectName: project.name,
      projectSlug: project.slug,
      requesterName: args.requesterLabel,
      key: args.key,
      environments: args.environments,
    }
  );

  return requestId;
}

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
  const project = await ctx.db.get(args.projectId);
  if (!project || project.deletedAt) {
    throw new ConvexError("Project not found");
  }

  // Requester must be assigned to the project (owners bypass assignment)
  const { orgRole, environmentScope } = await assertProjectAction(
    ctx,
    args.requestedBy,
    args.projectId,
    "project:read"
  );

  if (orgRole !== "developer") {
    throw new ConvexError(
      "Only developers can create variable requests — owners, project managers, and team leads can create variables directly"
    );
  }

  // Environment scope: scoped developers may only request variables whose
  // environments all fall inside their assignment scope
  if (!isEnvironmentScopeAllowed(environmentScope, args.environments)) {
    throw new ConvexError(
      `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
    );
  }

  const requester = await ctx.db.get(args.requestedBy);
  return insertRequest(ctx, {
    key: args.key,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    projectId: args.projectId,
    isSensitive: args.isSensitive ?? false,
    requestedBy: args.requestedBy,
    requesterLabel: requester?.name || requester?.email || "A developer",
  });
}

export const create = mutation({
  args: createRequestArgs,
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return createCore(ctx, { ...args, requestedBy: actor._id });
  },
});

// Anti-spam bounds for machine-originated requests. The per-key rate
// limiter (machineRequestCreate) throttles bursts; these bound STANDING
// state. ponytail: fixed constants, config knobs when a real org needs them.
const MAX_OPEN_MACHINE_REQUESTS_PER_KEY = 5;
const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Machine-originated request create. Internal — only
 * features/api/requests.ts's `createVariableRequest` action calls it, AFTER
 * `_authorizeRequest` validated the key (resource "requests", surface, org)
 * and resolved the project into the key's scope. This skips createCore's
 * human checks (org role, project assignment — meaningless for a
 * credential) and enforces the machine-specific bounds instead; everything
 * downstream (conflict check, dedupe, insert, audit, email) is the SAME
 * insertRequest core the human path uses.
 */
export const _createFromKey = internalMutation({
  args: {
    keyId: v.id("apiKeys"),
    projectId: v.id("projects"),
    key: v.string(),
    environments: v.array(v.string()),
    // The agent's justification — the approver's only context. Required.
    justification: v.string(),
    isSensitive: v.optional(v.boolean()),
  },
  returns: v.id("environmentVariableRequests"),
  handler: async (ctx, args) => {
    const apiKey = await ctx.db.get(args.keyId);
    if (
      !apiKey ||
      apiKey.revokedAt !== undefined ||
      (apiKey.expiresAt !== undefined && apiKey.expiresAt <= Date.now())
    ) {
      throw new ConvexError("Invalid or revoked API key");
    }

    if (args.justification.trim().length === 0) {
      throw new ConvexError(
        "A justification is required — it is the only context the reviewer sees"
      );
    }
    if (args.justification.length > 500) {
      throw new ConvexError("Justification must be at most 500 characters");
    }

    // Standing-state cap: an agent loop must not pile up pendings.
    const openForKey = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_requested_key_and_status", (q) =>
        q.eq("requestedByKeyId", args.keyId).eq("status", "pending")
      )
      .take(MAX_OPEN_MACHINE_REQUESTS_PER_KEY);
    if (openForKey.length >= MAX_OPEN_MACHINE_REQUESTS_PER_KEY) {
      throw new ConvexError(
        `This API key already has ${MAX_OPEN_MACHINE_REQUESTS_PER_KEY} pending requests — wait for a human to review them before filing more`
      );
    }

    // Rejection cooldown: a rejected ask may not be immediately re-filed —
    // return the reviewer's reason so the agent learns WHY and stops.
    const recentForKey = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_project_and_key", (q) =>
        q.eq("projectId", args.projectId).eq("key", args.key)
      )
      .collect();
    const now = Date.now();
    const recentRejection = recentForKey.find(
      (r) =>
        r.status === "rejected" &&
        r.requestedByKeyId === args.keyId &&
        (r.reviewedAt ?? 0) > now - REJECTION_COOLDOWN_MS &&
        r.environments.some((env) => args.environments.includes(env))
    );
    if (recentRejection) {
      throw new ConvexError(
        `A request for "${args.key}" was rejected in the last 24 hours${
          recentRejection.reviewReason
            ? ` ("${recentRejection.reviewReason}")`
            : ""
        } — do not re-file it; ask the user to talk to their reviewer instead`
      );
    }

    // Tier pre-check so the agent learns "project is at its variable limit"
    // at create time instead of a human discovering it at approve time. The
    // approve-time check in `review` stays the enforcement of record.
    const varCheck = await checkCountedLimit(
      ctx.db,
      apiKey.organizationId,
      "max_variables_per_project",
      (limit) => countActiveVariables(ctx.db, args.projectId, limit)
    );
    if (!varCheck.allowed) {
      throw new ConvexError(varCheck.reason!);
    }

    // requestedBy = the key's creator: the field is load-bearing (dedupe,
    // visibility, verdict email) and a machine has no user id of its own.
    // requestedByKeyId marks the real principal; UI/emails render the key.
    return insertRequest(ctx, {
      key: args.key,
      // Valueless by design: agents never propose secret values — the
      // reviewer supplies one at approval (approveWithValue).
      vaultRef: undefined,
      description: args.justification,
      environments: args.environments,
      projectId: args.projectId,
      isSensitive: args.isSensitive ?? false,
      requestedBy: apiKey.createdBy,
      requestedByKeyId: args.keyId,
      requesterLabel: `API key "${apiKey.name}"`,
    });
  },
});

/**
 * TTL sweep (cron): auto-cancel machine-originated requests that sat
 * pending past 30 days. Abandoned agent runs are routine; without this
 * their pendings rot the reviewer feed and the sidebar badge forever.
 * Human requests are exempt — a human can see and cancel their own.
 */
export const cancelStaleMachineRequests = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    // Bounded batch per run — an unbounded collect() over all pendings
    // could exceed transaction limits and roll the whole sweep back. The
    // index's ascending _creationTime order puts the OLDEST pendings first,
    // so daily runs always chew through the stale end of the queue.
    const SWEEP_BATCH = 200;
    const cutoff = Date.now() - STALE_MS;
    const pending = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .order("asc")
      .take(SWEEP_BATCH);

    let canceled = 0;
    for (const request of pending) {
      if (request.requestedByKeyId === undefined) continue;
      if (request.createdAt > cutoff) continue;
      await ctx.db.patch(request._id, {
        status: "canceled",
        reviewReason: "Auto-canceled: pending for more than 30 days",
        updatedAt: Date.now(),
      });
      await createAuditLog(ctx, {
        organizationId: request.organizationId,
        projectId: request.projectId,
        userId: request.requestedBy,
        action: "variable.request_canceled",
        details: {
          requestId: request._id,
          key: request.key,
          requestedByKeyId: request.requestedByKeyId,
          reason: "stale_machine_request",
        },
        resourceType: "variable",
        involvesSensitiveData: request.isSensitive,
      });
      canceled++;
    }
    return canceled;
  },
});

const reviewArgs = {
  requestId: v.id("environmentVariableRequests"),
  action: v.union(v.literal("approve"), v.literal("reject")),
  reviewReason: v.optional(v.string()),
  // Reviewer may override the approved environments (approve only).
  environments: v.optional(v.array(v.string())),
};

export const review = mutation({
  args: reviewArgs,
  handler: async (ctx, args) => reviewCore(ctx, args),
});

/**
 * Approve carrying a reviewer-supplied encrypted value for a VALUELESS
 * (machine) request. INTERNAL so no client can attach an arbitrary
 * vaultRef (a capability handle) to a variable — only the
 * approveWithValue action, which just encrypted the reviewer's plaintext,
 * can reach this. The caller's JWT identity propagates through
 * runMutation, so reviewCore's authorization applies unchanged.
 */
export const _approveWithSuppliedRef = internalMutation({
  args: {
    requestId: v.id("environmentVariableRequests"),
    reviewReason: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
    vaultRef: v.string(),
  },
  handler: async (ctx, args) => reviewCore(ctx, { ...args, action: "approve" }),
});

async function reviewCore(
  ctx: MutationCtx,
  args: {
    requestId: Id<"environmentVariableRequests">;
    action: "approve" | "reject";
    reviewReason?: string;
    environments?: string[];
    vaultRef?: string;
  }
) {
  {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Variable request not found");
    }

    // Authorization FIRST — before any state is disclosed. Without this
    // order, a caller from another org could distinguish pending vs
    // resolved requests (and probe origin-key liveness) from the error.
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
      throw new ConvexError(
        "Only owners, project managers, and team leads can review variable requests"
      );
    }

    if (request.status !== "pending") {
      throw new ConvexError(`Request has already been ${request.status}`);
    }

    // An environment override is only meaningful when approving.
    if (args.environments !== undefined && args.action !== "approve") {
      throw new ConvexError(
        "environments override is only allowed when approving a request"
      );
    }

    // A supplied value only makes sense approving a valueless request; a
    // request that carries the requester's proposed value keeps it.
    if (args.vaultRef !== undefined && request.vaultRef !== undefined) {
      throw new ConvexError(
        "A value can only be supplied when approving a request that has none"
      );
    }

    // Machine-originated: refuse to APPROVE on behalf of a dead credential.
    // Revoking a key does not cancel its pendings (and expiry never could),
    // so the liveness check lives here — an exfiltrated key's requests must
    // not be one click from approval. Rejecting stays allowed.
    if (request.requestedByKeyId !== undefined && args.action === "approve") {
      const originKey = await ctx.db.get(request.requestedByKeyId);
      if (
        !originKey ||
        originKey.revokedAt !== undefined ||
        (originKey.expiresAt !== undefined && originKey.expiresAt <= now)
      ) {
        throw new ConvexError(
          "The API key that filed this request has been revoked or expired — reject the request instead"
        );
      }
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

      await notifyRequesterOfVerdict(ctx, {
        request,
        project,
        actor,
        verdict: "rejected",
        reviewReason: args.reviewReason,
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
      assertValidEnvironments(args.environments);
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
      throw new ConvexError(varCheck.reason!);
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

    // Valueless (machine) requests approve with the REVIEWER's value; the
    // approveWithValue action encrypts it and passes the fresh ref here.
    const finalVaultRef = request.vaultRef ?? args.vaultRef;
    if (finalVaultRef === undefined) {
      throw new ConvexError(
        "This request has no proposed value — supply one when approving"
      );
    }

    const variableId = await ctx.db.insert("environmentVariables", {
      key: request.key,
      vaultRef: finalVaultRef,
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
      vaultRef: finalVaultRef,
      description: request.description,
      environments: approvedEnvironments,
      changedBy: actor._id,
      changeReason: `Approved request ${args.requestId}`,
      createdAt: now,
    });

    // The requester (a developer with no blanket write access) keeps write
    // access to the variable they requested via an automatic grant. SKIPPED
    // for machine-originated requests: the key's creator never asked for
    // personal write access, and keys themselves never get write — the
    // key's existing read scope is the only machine access model.
    if (request.requestedByKeyId === undefined) {
      await ctx.db.insert("variablePermissions", {
        variableId,
        userId: request.requestedBy,
        permission: "write",
        grantedBy: actor._id,
        grantedAt: now,
        isActive: true,
      });
    }

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

    await notifyRequesterOfVerdict(ctx, {
      request,
      project,
      actor,
      verdict: "approved",
      reviewReason: args.reviewReason,
    });

    return {
      requestId: args.requestId,
      status: "approved" as const,
      variableId,
    };
  }
}

/**
 * Email the requester the approve/reject verdict. Best-effort + scheduled — a
 * send failure must never block or roll back the review mutation.
 */
async function notifyRequesterOfVerdict(
  ctx: MutationCtx,
  args: {
    request: Doc<"environmentVariableRequests">;
    project: Doc<"projects">;
    actor: Doc<"users">;
    verdict: "approved" | "rejected";
    reviewReason?: string;
  }
) {
  const requester = await ctx.db.get(args.request.requestedBy);
  if (!requester?.email) return;
  await ctx.scheduler.runAfter(
    0,
    internal.features.emails.emails.sendVariableRequestReviewedEmail,
    {
      to: requester.email,
      requesterName: requester.name,
      key: args.request.key,
      projectName: args.project.name,
      verdict: args.verdict,
      reviewerName: args.actor.name || args.actor.email,
      reviewReason: args.reviewReason,
    }
  );
}

export const cancel = mutation({
  args: {
    requestId: v.id("environmentVariableRequests"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Variable request not found");
    }

    if (request.status !== "pending") {
      throw new ConvexError(
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
      throw new ConvexError("Not authorized to cancel this request");
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
