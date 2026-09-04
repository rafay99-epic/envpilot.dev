import { v, ConvexError } from "convex/values";
import { query, internalQuery, type QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  assertOrgMembership,
  assertProjectAction,
  getActiveMembership,
  getRoleProfile,
  hasCapability,
  isEnvironmentScopeAllowed,
} from "../../lib/authz";
import {
  protectedEnvironmentsIn,
  touchedEnvironments,
} from "../../lib/protection";
import { assertCouldWriteDirectly } from "./authorize";
import { collectVisibleInOrg, orgRequestScopes } from "./visibility";

/** Read window for every list here; the inbox is a queue, not an archive. */
const MAX_ROWS = 200;
/** Bound on reported pending counts (badges, not analytics). */
const COUNT_CAP = 500;

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("applied"),
  v.literal("rejected"),
  v.literal("canceled"),
  v.literal("expired")
);

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

const personValidator = v.union(
  v.object({
    _id: v.id("users"),
    name: v.optional(v.string()),
    email: v.string(),
  }),
  v.null()
);

/**
 * Every changeRequests field EXCEPT `vaultRef` and `storageId`. Those point
 * at the staged secret, and vault reads resolve a ref by id alone — handing
 * one to a project reader would disclose the value the approval exists to
 * gate. The validator is the backstop: a future spread cannot re-leak them.
 */
const publicRequestFields = {
  _id: v.id("changeRequests"),
  _creationTime: v.number(),
  organizationId: v.id("organizations"),
  projectId: v.id("projects"),
  resourceType: resourceTypeValidator,
  kind: kindValidator,
  targetId: v.optional(v.string()),
  expectedVersion: v.optional(v.number()),
  environments: v.array(v.string()),
  payload: v.string(),
  label: v.string(),
  reason: v.optional(v.string()),
  requestedBy: v.id("users"),
  requestedByKeyId: v.optional(v.id("apiKeys")),
  source: v.union(
    v.literal("web"),
    v.literal("cli"),
    v.literal("mcp"),
    v.literal("extension")
  ),
  status: statusValidator,
  reviewedBy: v.optional(v.id("users")),
  reviewedAt: v.optional(v.number()),
  reviewReason: v.optional(v.string()),
  appliedResourceId: v.optional(v.string()),
  reminderSentAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
};

const listRowValidator = v.object({
  ...publicRequestFields,
  requester: personValidator,
  reviewer: personValidator,
});

type Person = { _id: Id<"users">; name?: string; email: string } | null;

/** Drop the staged secret refs; everything else on the row is metadata. */
function publicRow(row: Doc<"changeRequests">) {
  const { vaultRef: _vaultRef, storageId: _storageId, ...rest } = row;
  return rest;
}

async function loadPerson(
  ctx: QueryCtx,
  userId: Id<"users"> | undefined,
  cache: Map<string, Person>
): Promise<Person> {
  if (!userId) return null;
  const key = userId.toString();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const user = await ctx.db.get(userId);
  const person: Person = user
    ? { _id: user._id, name: user.name, email: user.email }
    : null;
  cache.set(key, person);
  return person;
}

async function withPeople(ctx: QueryCtx, rows: Doc<"changeRequests">[]) {
  const cache = new Map<string, Person>();
  const out = [];
  for (const row of rows) {
    out.push({
      ...publicRow(row),
      requester: await loadPerson(ctx, row.requestedBy, cache),
      reviewer: await loadPerson(ctx, row.reviewedBy, cache),
    });
  }
  return out;
}

export const listForProject = query({
  args: {
    projectId: v.id("projects"),
    status: v.optional(statusValidator),
  },
  returns: v.array(listRowValidator),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { environmentScope } = await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:read"
    );

    const rows = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) =>
        args.status
          ? q.eq("projectId", args.projectId).eq("status", args.status)
          : q.eq("projectId", args.projectId)
      )
      .order("desc")
      .take(MAX_ROWS);

    // A scoped member must not learn that a production change is in flight.
    const visible = rows.filter((row) =>
      isEnvironmentScopeAllowed(environmentScope, row.environments)
    );
    return withPeople(ctx, visible);
  },
});

export const listForOrg = query({
  args: {
    organizationId: v.id("organizations"),
    status: v.optional(statusValidator),
  },
  returns: v.array(listRowValidator),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { profile } = await assertOrgMembership(
      ctx,
      actor._id,
      args.organizationId
    );

    const scopes = await orgRequestScopes(ctx, actor._id, profile);
    const rows = await collectVisibleInOrg(
      ctx.db
        .query("changeRequests")
        .withIndex("by_org_status", (q) =>
          args.status
            ? q
                .eq("organizationId", args.organizationId)
                .eq("status", args.status)
            : q.eq("organizationId", args.organizationId)
        )
        .order("desc"),
      scopes,
      MAX_ROWS
    );
    return withPeople(ctx, rows);
  },
});

export const pendingCountForProject = query({
  args: { projectId: v.id("projects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { environmentScope } = await assertProjectAction(
      ctx,
      actor._id,
      args.projectId,
      "project:read"
    );
    const rows = await ctx.db
      .query("changeRequests")
      .withIndex("by_project_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "pending")
      )
      .take(COUNT_CAP);
    // The badge must count exactly what listForProject would show.
    return rows.filter((row) =>
      isEnvironmentScopeAllowed(environmentScope, row.environments)
    ).length;
  },
});

export const pendingCountForOrg = query({
  args: { organizationId: v.id("organizations") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const { profile } = await assertOrgMembership(
      ctx,
      actor._id,
      args.organizationId
    );
    const scopes = await orgRequestScopes(ctx, actor._id, profile);
    // The badge counts what listForOrg would show, so it filters as it scans:
    // capping first drops rows this actor can see behind ones they cannot.
    const rows = await collectVisibleInOrg(
      ctx.db
        .query("changeRequests")
        .withIndex("by_org_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", "pending")
        ),
      scopes,
      COUNT_CAP
    );
    return rows.length;
  },
});

const currentValidator = v.union(
  v.object({
    key: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    isSensitive: v.boolean(),
    rotationFrequencyDays: v.optional(v.number()),
    tagIds: v.optional(v.array(v.id("variableTags"))),
    version: v.number(),
  }),
  v.object({
    name: v.string(),
    websiteUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    version: v.number(),
  }),
  v.object({
    name: v.string(),
    path: v.string(),
    mode: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.number(),
    environments: v.array(v.string()),
    version: v.number(),
  }),
  v.null()
);

/**
 * Non-secret snapshot of what the proposal's target looks like right now, so
 * the review drawer can diff against it. Never a value, a credential, or a
 * file's contents — only metadata.
 */
async function loadCurrent(ctx: QueryCtx, request: Doc<"changeRequests">) {
  if (request.targetId === undefined) return null;

  if (request.resourceType === "account") {
    const id = ctx.db.normalizeId("projectAccounts", request.targetId);
    const account = id ? await ctx.db.get(id) : null;
    return account
      ? {
          name: account.name,
          websiteUrl: account.websiteUrl,
          description: account.description,
          environments: account.environments,
          version: account.version,
        }
      : null;
  }

  if (request.resourceType === "file") {
    const id = ctx.db.normalizeId("projectFiles", request.targetId);
    const file = id ? await ctx.db.get(id) : null;
    return file
      ? {
          name: file.name,
          path: file.path,
          mode: file.mode,
          contentType: file.contentType,
          size: file.size,
          environments: file.environments,
          version: file.version,
        }
      : null;
  }

  const id = ctx.db.normalizeId("environmentVariables", request.targetId);
  const variable = id ? await ctx.db.get(id) : null;
  return variable
    ? {
        key: variable.key,
        description: variable.description,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        rotationFrequencyDays: variable.rotationFrequencyDays,
        tagIds: variable.tagIds,
        version: variable.version,
      }
    : null;
}

export const getForReview = query({
  args: { requestId: v.id("changeRequests") },
  returns: v.object({
    ...publicRequestFields,
    requester: personValidator,
    reviewer: personValidator,
    current: currentValidator,
    isStale: v.boolean(),
    canApprove: v.boolean(),
    canCancel: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) {
      throw new ConvexError("Change request not found");
    }

    const { profile, environmentScope } = await assertProjectAction(
      ctx,
      actor._id,
      request.projectId,
      "project:read"
    );

    // Out of scope is indistinguishable from absent: a request id must not
    // disclose target metadata listForProject hides from this member.
    if (!isEnvironmentScopeAllowed(environmentScope, request.environments)) {
      throw new ConvexError("Change request not found");
    }

    const current = await loadCurrent(ctx, request);

    // Stale means the proposal no longer describes the resource it was
    // filed against, so approving it would apply to something else.
    const isStale =
      request.expectedVersion !== undefined &&
      (current === null || current.version !== request.expectedVersion);

    const canApprove =
      hasCapability(profile, "project.protection.approve") &&
      request.requestedBy !== actor._id;

    const cache = new Map<string, Person>();
    return {
      ...publicRow(request),
      requester: await loadPerson(ctx, request.requestedBy, cache),
      reviewer: await loadPerson(ctx, request.reviewedBy, cache),
      current,
      isStale,
      canApprove,
      canCancel:
        request.status === "pending" &&
        (request.requestedBy === actor._id ||
          hasCapability(profile, "project.protection.approve")),
    };
  },
});

/**
 * Non-secret snapshot of a proposal's target, INCLUDING trashed rows (a
 * restore proposal targets a soft-deleted variable, which the public
 * getById hides). Internal: reachable only from the createVariableChange
 * action, whose write is authorized by the create mutation afterwards.
 */
export const _targetSnapshot = internalQuery({
  args: {
    variableId: v.optional(v.id("environmentVariables")),
    accountId: v.optional(v.id("projectAccounts")),
    fileId: v.optional(v.id("projectFiles")),
  },
  returns: v.union(
    v.object({
      projectId: v.id("projects"),
      // The resource's label: variable key, account name, or file path.
      key: v.string(),
      environments: v.array(v.string()),
      version: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    if (args.accountId) {
      const account = await ctx.db.get(args.accountId);
      return account
        ? {
            projectId: account.projectId,
            key: account.name,
            environments: account.environments,
            version: account.version,
          }
        : null;
    }
    if (args.fileId) {
      const file = await ctx.db.get(args.fileId);
      return file
        ? {
            projectId: file.projectId,
            key: file.path,
            environments: file.environments,
            version: file.version,
          }
        : null;
    }
    if (!args.variableId) return null;
    const variable = await ctx.db.get(args.variableId);
    if (!variable) return null;
    return {
      projectId: variable.projectId,
      key: variable.key,
      environments: variable.environments,
      version: variable.version,
    };
  },
});

/**
 * The authorization `create` would apply, run BEFORE an action mints a vault
 * object for the proposal. Without it any signed-in user could mint secrets
 * in any project's vault key context and only be refused afterwards.
 * Returns the protected subset of what the write would touch.
 */
export const canProposeVariableChange = internalQuery({
  args: {
    userId: v.id("users"),
    projectId: v.id("projects"),
    kind: kindValidator,
    variableId: v.optional(v.id("environmentVariables")),
    environments: v.optional(v.array(v.string())),
    targetVersion: v.optional(v.number()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }
    const { environmentScope } = await assertProjectAction(
      ctx,
      args.userId,
      args.projectId,
      "project:read",
      project
    );
    const { currentEnvironments } = await assertCouldWriteDirectly(
      ctx,
      args.userId,
      project,
      {
        resourceType: "variable",
        kind: args.kind,
        targetId: args.variableId,
        targetVersion: args.targetVersion,
      }
    );
    const environments = touchedEnvironments(
      currentEnvironments,
      args.environments
    );
    if (!isEnvironmentScopeAllowed(environmentScope, environments)) {
      throw new ConvexError(
        `Your access is limited to these environments: ${(environmentScope ?? []).join(", ")}`
      );
    }
    return protectedEnvironmentsIn(project, environments);
  },
});

/**
 * Whether the actor holds break-glass. Actions call this BEFORE minting or
 * updating a vault object for an `override` write: the mutation checks the
 * same capability, but only once the secret already exists, so a refusal
 * there could only be compensated for, never prevented.
 */
export const canOverrideProtection = internalQuery({
  args: { userId: v.id("users"), projectId: v.id("projects") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return false;
    const membership = await getActiveMembership(
      ctx,
      project.organizationId,
      args.userId
    );
    if (!membership) return false;
    const profile = await getRoleProfile(ctx, membership.role);
    return hasCapability(profile, "project.protection.override");
  },
});

/**
 * The protected subset of what a write would touch. Actions call this BEFORE
 * minting a vault object so a refused write never leaves a secret behind.
 */
export const protectedEnvironmentsForWrite = internalQuery({
  args: {
    projectId: v.id("projects"),
    variableId: v.optional(v.id("environmentVariables")),
    accountId: v.optional(v.id("projectAccounts")),
    fileId: v.optional(v.id("projectFiles")),
    environments: v.optional(v.array(v.string())),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) return [];
    const targetId = args.variableId ?? args.accountId ?? args.fileId;
    const target = targetId ? await ctx.db.get(targetId) : null;
    return protectedEnvironmentsIn(
      project,
      touchedEnvironments(target?.environments, args.environments)
    );
  },
});
