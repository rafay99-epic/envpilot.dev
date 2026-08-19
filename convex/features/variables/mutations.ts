import { v, ConvexError } from "convex/values";
import {
  mutation,
  internalMutation,
  type MutationCtx,
} from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { MAX_BULK_IMPORT_SIZE } from "../billing/tierLimits";
import { MAX_BATCH_VARIABLES } from "../../lib/batchLimits";
import {
  checkCountedLimit,
  checkBooleanFeature,
  countActiveVariables,
  countRotationEnabledVariables,
} from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";
import { createAuditLog, logVariableAccess } from "../../lib/audit";
import { rateLimiter } from "../../lib/rateLimits";
import {
  authorizeVariableAccess,
  requireVariableAccess,
} from "../../lib/authHelpers";
import { PURGE_RETENTION_DAYS } from "../vault/gc";
import {
  assertOrgAction,
  normalizeOrgRole,
  getRoleProfile,
  hasCapability,
} from "../../lib/authz";
import { revokeSharesForResource } from "../sharing/helpers";
import {
  assertWithinEnvironmentScope,
  assertValidVariableFields,
  findEnvironmentConflicts,
  findBatchInternalConflicts,
  environmentConflictMessage,
  describeConflictSource,
} from "./helpers";

/**
 * Environment Variable Mutations
 */

// ==========================================
// MUTATIONS
// ==========================================

/**
 * Per-batch context resolved ONCE by `createMany` and reused for every row.
 *
 * The project lookup, the authorization, the tier gate and the rate-limit
 * charge are properties of the batch, not of each variable in it. Resolving
 * them per row was the whole cost of the old one-request-per-variable shape;
 * charging the rate limit per row is what made a 48-variable template lose
 * everything past the 30th.
 */
type BatchCreateContext = {
  project: Doc<"projects">;
  auth: Awaited<ReturnType<typeof authorizeVariableAccess>>;
  gate: Awaited<ReturnType<typeof resolveOrgGateContext>>;
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
    createdBy: Id<"users">;
    rotationFrequencyDays?: number;
    tagIds?: Id<"variableTags">[];
  },
  batch?: BatchCreateContext
) {
  const now = Date.now();

  // Shape validation before anything else: cheap, and it used to happen in
  // the deleted POST /api/variables zod schema.
  assertValidVariableFields(args);

  const project = batch?.project ?? (await ctx.db.get(args.projectId));
  if (!project || project.deletedAt) {
    throw new Error("Project not found");
  }

  // Authorization: owner, or assigned PM / team lead / developer
  const { environmentScope, profile: creatorProfile } =
    batch?.auth ??
    (await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_variable",
      preloadedProject: project,
    }));

  // Environment scope: scoped developers may only create variables whose
  // environments all fall inside their assignment scope. Stays per-row: the
  // scope is one check but the environments differ per variable.
  assertWithinEnvironmentScope(environmentScope, args.environments);

  // Rate limit: prevent excessive variable creation. Batches are charged once
  // up front against variableBatchCreate instead (see startFromTemplate), so
  // charging again here would bill a 48-variable template 49 times.
  if (!batch) {
    await rateLimiter.limit(ctx, "variableCreate", {
      key: project.organizationId,
      throws: true,
    });
  }

  // Resolve the shared org/tier/grace-period context once and reuse it for
  // every feature check against this org in this handler (avoids re-fetching
  // the same rows per check). Zero behavior change.
  const gate =
    batch?.gate ??
    (await resolveOrgGateContext(ctx.db, project.organizationId));

  // Check tier limits for variable creation. Limit-first: only counts
  // existing variables when the tier's limit is finite, and bounds that
  // count at the limit instead of scanning every variable in the project.
  // A batch checks the whole batch size once, before the loop.
  if (!batch) {
    const varCheck = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      (limit) => countActiveVariables(ctx.db, args.projectId, limit),
      gate
    );
    if (!varCheck.allowed) {
      throw new Error(varCheck.reason!);
    }
  }

  // Validate rotation frequency bounds
  if (args.rotationFrequencyDays !== undefined) {
    if (args.rotationFrequencyDays < 0 || args.rotationFrequencyDays > 3650) {
      throw new Error("Rotation frequency must be between 0 and 3650 days");
    }
  }

  // If rotation is requested, check boolean gate + numeric limit
  if (args.rotationFrequencyDays && args.rotationFrequencyDays > 0) {
    const rotationCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secret_rotation",
      gate
    );
    if (!rotationCheck.allowed) {
      throw new Error(
        "Secret rotation requires a higher tier. Upgrade to enable rotation schedules."
      );
    }

    // Check rotation-enabled variable limit. Limit-first: skips the
    // org-wide fan-out entirely when rotation is unlimited for this tier.
    const limitCheck = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "secret_rotation_limit",
      (limit) =>
        countRotationEnabledVariables(
          ctx.db,
          project.organizationId,
          undefined,
          limit
        ),
      gate
    );
    if (!limitCheck.allowed) {
      throw new Error(
        `Rotation-enabled variable limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your tier for more.`
      );
    }
  }

  // Validate and deduplicate tagIds
  const validatedTagIds =
    args.tagIds && args.tagIds.length > 0
      ? [...new Set(args.tagIds)]
      : undefined;

  if (validatedTagIds && validatedTagIds.length > 0) {
    if (validatedTagIds.length > 10) {
      throw new Error("A variable can have at most 10 tags");
    }

    for (const tagId of validatedTagIds) {
      const tag = await ctx.db.get(tagId);
      if (!tag || tag.deletedAt) {
        throw new Error(`Tag not found: ${tagId}`);
      }
      if (tag.organizationId !== project.organizationId) {
        throw new Error("Tag does not belong to this organization");
      }
    }
  }

  // Per-environment uniqueness: same key allowed across DISJOINT environment
  // sets (dev/staging/prod copies of the same key are separate variables).
  // ConvexError: plain Error messages are redacted to "Server Error" on
  // production deployments, which broke the client's duplicate-key handling.
  const envClashes = await findEnvironmentConflicts(ctx, {
    projectId: args.projectId,
    key: args.key,
    environments: args.environments,
  });
  if (envClashes.length > 0) {
    throw new ConvexError(environmentConflictMessage(args.key, envClashes));
  }

  // Build rotation fields if rotation is enabled
  const rotationFields:
    | {
        rotationFrequencyDays: number;
        expiresAt: number;
        lastRotatedAt: number;
        rotationStatus: "active";
      }
    | Record<string, never> =
    args.rotationFrequencyDays && args.rotationFrequencyDays > 0
      ? {
          rotationFrequencyDays: args.rotationFrequencyDays,
          expiresAt: now + args.rotationFrequencyDays * 24 * 60 * 60 * 1000,
          lastRotatedAt: now,
          rotationStatus: "active" as const,
        }
      : {};

  const variableId = await ctx.db.insert("environmentVariables", {
    key: args.key,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    projectId: args.projectId,
    isSensitive: args.isSensitive ?? false,
    createdBy: args.createdBy,
    lastModifiedBy: args.createdBy,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...rotationFields,
    ...(validatedTagIds && validatedTagIds.length > 0
      ? { tagIds: validatedTagIds }
      : {}),
  });

  await ctx.db.insert("variableVersions", {
    variableId,
    version: 1,
    vaultRef: args.vaultRef,
    description: args.description,
    environments: args.environments,
    changedBy: args.createdBy,
    changeReason: "Initial creation",
    createdAt: now,
  });

  // Creators WITHOUT blanket write (grant-fallback roles like developer)
  // get an automatic write grant so they keep editing what they created —
  // main parity, generalized to any create-capable non-blanket role.
  if (!hasCapability(creatorProfile, "project.variables.update")) {
    await ctx.db.insert("variablePermissions", {
      variableId,
      userId: args.createdBy,
      permission: "write",
      grantedBy: args.createdBy,
      grantedAt: now,
      isActive: true,
    });
  }

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: args.projectId,
    variableId,
    userId: args.createdBy,
    action: "variable.created",
    details: {
      key: args.key,
      environments: args.environments,
      isSensitive: args.isSensitive ?? false,
      rotationFrequencyDays: args.rotationFrequencyDays,
    },
    involvesSensitiveData: args.isSensitive ?? false,
    resourceType: "variable",
  });

  return variableId;
}

const createArgs = {
  key: v.string(),
  vaultRef: v.string(),
  description: v.optional(v.string()),
  environments: v.array(v.string()),
  projectId: v.id("projects"),
  isSensitive: v.optional(v.boolean()),
  rotationFrequencyDays: v.optional(v.number()),
  tagIds: v.optional(v.array(v.id("variableTags"))),
};

export const create = mutation({
  args: createArgs,
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return createCore(ctx, { ...args, createdBy: actor._id });
  },
});

/**
 * Charge the batch-create budget once for a bulk write, and hand back the
 * actor so the caller can pass it to `createMany`.
 *
 * Bulk paths that create variables one call at a time charge `variableCreate`
 * per row, which is why a 48-variable import died on the 31st: the bucket
 * holds 30. Actions cannot resolve the caller or touch the limiter directly,
 * so they reserve through here first. Same explicit-reserve shape
 * `startFromTemplate` uses; keeping it explicit means every bulk entry point
 * is greppable rather than relying on a hidden charge somewhere downstream.
 */
export const reserveBatchCreate = internalMutation({
  args: {
    projectId: v.id("projects"),
    count: v.number(),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }
    // A push that only updates existing rows creates nothing, so it should not
    // spend create budget.
    if (args.count > 0) {
      await rateLimiter.limit(ctx, "variableBatchCreate", {
        key: project.organizationId,
        count: args.count,
        throws: true,
      });
    }
    return actor._id;
  },
});

/**
 * Persist a whole batch of already-encrypted variables in ONE transaction.
 *
 * Every row, its version row, its creator grant and its audit entry either all
 * land or none do, so a project can never come up half-populated. This is the
 * property the old per-variable HTTP loop could not offer at any speed.
 *
 * Internal on purpose: the caller must have written the values to the vault
 * first and must own the rollback of those refs if this throws. Public entry
 * points are `projects.templates.startFromTemplate` and the import action.
 */
export const createMany = internalMutation({
  args: {
    projectId: v.id("projects"),
    createdBy: v.id("users"),
    variables: v.array(
      v.object({
        key: v.string(),
        vaultRef: v.string(),
        description: v.optional(v.string()),
        environments: v.array(v.string()),
        isSensitive: v.optional(v.boolean()),
      })
    ),
  },
  returns: v.array(v.id("environmentVariables")),
  handler: async (ctx, args) => {
    if (args.variables.length === 0) return [];
    if (args.variables.length > MAX_BATCH_VARIABLES) {
      throw new ConvexError(
        `A single batch may contain at most ${MAX_BATCH_VARIABLES} variables.`
      );
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.deletedAt) {
      throw new ConvexError("Project not found");
    }

    // Resolve authorization and the tier context ONCE for the whole batch.
    const auth = await authorizeVariableAccess(ctx, {
      userId: args.createdBy,
      projectId: args.projectId,
      action: "project:create_variable",
      preloadedProject: project,
    });
    const gate = await resolveOrgGateContext(ctx.db, project.organizationId);

    // Admit or refuse the whole batch against the per-project tier limit.
    // Checking per row would admit rows until the limit bound and then throw
    // mid-loop, which is the same partial-apply failure this path exists to
    // remove.
    const varCheck = await checkCountedLimit(
      ctx.db,
      project.organizationId,
      "max_variables_per_project",
      (limit) => countActiveVariables(ctx.db, args.projectId, limit),
      gate,
      args.variables.length
    );
    if (!varCheck.allowed) {
      throw new ConvexError(varCheck.reason!);
    }

    // In-batch clashes first, for a message that names the offending key.
    // createCore re-checks each row against the database as it goes, which
    // also catches rows inserted earlier in this very loop — that is the
    // race-safe backstop, this is the good error.
    const internalClashes = findBatchInternalConflicts(args.variables);
    if (internalClashes.length > 0) {
      const first = internalClashes[0]!;
      throw new ConvexError(
        `This batch defines "${first.key}" more than once for environment(s): ${first.clashes.join(", ")}. The same key is allowed only across non-overlapping environments.`
      );
    }

    const batch: BatchCreateContext = { project, auth, gate };
    const created: Id<"environmentVariables">[] = [];
    for (const variable of args.variables) {
      created.push(
        await createCore(
          ctx,
          {
            ...variable,
            projectId: args.projectId,
            createdBy: args.createdBy,
          },
          batch
        )
      );
    }
    return created;
  },
});

async function updateCore(
  ctx: MutationCtx,
  args: {
    variableId: Id<"environmentVariables">;
    vaultRef?: string;
    description?: string;
    environments?: string[];
    isSensitive?: boolean;
    updatedBy: Id<"users">;
    changeReason?: string;
    rotationFrequencyDays?: number;
    tagIds?: Id<"variableTags">[];
  }
) {
  const now = Date.now();
  const {
    variableId,
    updatedBy,
    changeReason,
    rotationFrequencyDays,
    tagIds: rawTagIds,
    ...updates
  } = args;

  const variable = await ctx.db.get(variableId);
  if (!variable || variable.deletedAt) {
    throw new Error("Variable not found");
  }

  const project = await ctx.db.get(variable.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Authorization: effective write access — owner, assigned PM/team lead,
  // or a developer holding a write grant on this variable
  await requireVariableAccess(ctx, updatedBy, variable, "write", project);

  // Environment scope: getVariableAccess already blocks scoped developers
  // from touching out-of-scope variables, but the NEW environments must
  // also stay inside the scope — a scoped developer must not be able to
  // move a variable into production
  if (updates.environments !== undefined) {
    const editorMembership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_org_and_user", (q) =>
        q.eq("organizationId", project.organizationId).eq("userId", updatedBy)
      )
      .first();

    const updaterProfile = editorMembership
      ? await getRoleProfile(ctx, editorMembership.role)
      : null;
    if (updaterProfile && hasCapability(updaterProfile, "access.env_scoped")) {
      const editorAssignment = await ctx.db
        .query("projectMembers")
        .withIndex("by_project_and_user", (q) =>
          q.eq("projectId", variable.projectId).eq("userId", updatedBy)
        )
        .first();

      assertWithinEnvironmentScope(
        editorAssignment?.environments,
        updates.environments
      );
    }

    // Re-validate per-environment key uniqueness: expanding this variable's
    // environments must not collide with a sibling variable of the same key.
    const envClashes = await findEnvironmentConflicts(ctx, {
      projectId: variable.projectId,
      key: variable.key,
      environments: updates.environments,
      excludeVariableId: variable._id,
    });
    if (envClashes.length > 0) {
      throw new ConvexError(
        environmentConflictMessage(variable.key, envClashes)
      );
    }
  }

  // Validate rotation frequency bounds
  if (rotationFrequencyDays !== undefined) {
    if (rotationFrequencyDays < 0 || rotationFrequencyDays > 3650) {
      throw new Error("Rotation frequency must be between 0 and 3650 days");
    }
  }

  // If rotation is being set/changed, check boolean gate + numeric limit
  if (rotationFrequencyDays !== undefined && rotationFrequencyDays > 0) {
    // Resolve the shared org/tier/grace context once for both gate checks.
    const gate = await resolveOrgGateContext(ctx.db, project.organizationId);

    const rotationCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "secret_rotation",
      gate
    );
    if (!rotationCheck.allowed) {
      throw new Error(
        "Secret rotation requires a higher tier. Upgrade to enable rotation schedules."
      );
    }

    // Check rotation limit only when enabling rotation on a variable that didn't have it
    const alreadyHasRotation =
      variable.rotationFrequencyDays !== undefined &&
      variable.rotationFrequencyDays > 0;
    if (!alreadyHasRotation) {
      const limitCheck = await checkCountedLimit(
        ctx.db,
        project.organizationId,
        "secret_rotation_limit",
        (limit) =>
          countRotationEnabledVariables(
            ctx.db,
            project.organizationId,
            undefined,
            limit
          ),
        gate
      );
      if (!limitCheck.allowed) {
        throw new Error(
          `Rotation-enabled variable limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your tier for more.`
        );
      }
    }
  }

  // Validate and deduplicate tagIds if provided
  const tagIds = rawTagIds !== undefined ? [...new Set(rawTagIds)] : undefined;

  if (tagIds !== undefined) {
    if (tagIds.length > 10) {
      throw new Error("A variable can have at most 10 tags");
    }

    for (const tId of tagIds) {
      const tag = await ctx.db.get(tId);
      if (!tag || tag.deletedAt) {
        throw new Error(`Tag not found: ${tId}`);
      }
      if (tag.organizationId !== project.organizationId) {
        throw new Error("Tag does not belong to this organization");
      }
    }
  }

  const newVersion = variable.version + 1;
  const isValueRotated = updates.vaultRef !== undefined;

  const updateData: Record<string, unknown> = {
    updatedAt: now,
    lastModifiedBy: updatedBy,
    version: newVersion,
  };

  if (updates.vaultRef !== undefined) updateData.vaultRef = updates.vaultRef;
  // An empty string clears the optional field. Convex patch treats an
  // explicit `undefined` as field removal, so map "" → undefined (mirrors
  // accounts.update).
  if (updates.description !== undefined)
    updateData.description =
      updates.description === "" ? undefined : updates.description;
  if (updates.environments !== undefined)
    updateData.environments = updates.environments;
  if (updates.isSensitive !== undefined)
    updateData.isSensitive = updates.isSensitive;
  if (tagIds !== undefined)
    updateData.tagIds = tagIds.length > 0 ? tagIds : undefined;

  // Handle rotation frequency changes
  if (rotationFrequencyDays !== undefined) {
    if (rotationFrequencyDays === 0) {
      // Disable rotation — clear all rotation fields
      updateData.rotationFrequencyDays = undefined;
      updateData.expiresAt = undefined;
      updateData.lastRotatedAt = undefined;
      updateData.rotationStatus = undefined;
      updateData.lastReminderSentAt = undefined;
    } else {
      updateData.rotationFrequencyDays = rotationFrequencyDays;
    }
  }

  // Determine the effective rotation frequency after this update
  const effectiveFreqDays =
    rotationFrequencyDays !== undefined
      ? rotationFrequencyDays
      : variable.rotationFrequencyDays;

  // If the secret value is being rotated and rotation schedule is active, reset the timer
  if (isValueRotated && effectiveFreqDays && effectiveFreqDays > 0) {
    updateData.lastRotatedAt = now;
    updateData.expiresAt = now + effectiveFreqDays * 24 * 60 * 60 * 1000;
    updateData.rotationStatus = "active";
    updateData.lastReminderSentAt = undefined;
  } else if (
    effectiveFreqDays &&
    effectiveFreqDays > 0 &&
    rotationFrequencyDays !== undefined &&
    rotationFrequencyDays > 0
  ) {
    // Frequency changed without a value rotation — recompute from lastRotatedAt
    const baseTime = variable.lastRotatedAt ?? now;
    updateData.expiresAt = baseTime + effectiveFreqDays * 24 * 60 * 60 * 1000;
    if (!variable.lastRotatedAt) {
      updateData.lastRotatedAt = now;
    }
    // Recompute status
    const expiresAt = updateData.expiresAt as number;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (expiresAt <= now) {
      updateData.rotationStatus = "expired";
    } else if (expiresAt <= now + sevenDays) {
      updateData.rotationStatus = "expiring_soon";
    } else {
      updateData.rotationStatus = "active";
    }
  }

  await ctx.db.patch(variableId, updateData);

  await ctx.db.insert("variableVersions", {
    variableId,
    version: newVersion,
    vaultRef: updates.vaultRef ?? variable.vaultRef,
    description: updates.description ?? variable.description,
    environments: updates.environments ?? variable.environments,
    changedBy: updatedBy,
    changeReason,
    createdAt: now,
  });

  // Use "variable.rotated" if the value was changed on a rotation-enabled variable
  const auditAction =
    isValueRotated && variable.rotationFrequencyDays
      ? ("variable.rotated" as const)
      : ("variable.updated" as const);

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: variable.projectId,
    variableId,
    userId: updatedBy,
    action: auditAction,
    details: {
      key: variable.key,
      environments: updates.environments ?? variable.environments,
      newVersion,
      previousVersion: variable.version,
      changeReason,
      fieldsUpdated: Object.keys(updates).filter(
        (k) => updates[k as keyof typeof updates] !== undefined
      ),
      rotationFrequencyDays:
        rotationFrequencyDays ?? variable.rotationFrequencyDays,
    },
    involvesSensitiveData: variable.isSensitive,
    resourceType: "variable",
  });

  return variableId;
}

const updateArgs = {
  variableId: v.id("environmentVariables"),
  vaultRef: v.optional(v.string()),
  description: v.optional(v.string()),
  environments: v.optional(v.array(v.string())),
  isSensitive: v.optional(v.boolean()),
  changeReason: v.optional(v.string()),
  rotationFrequencyDays: v.optional(v.number()),
  tagIds: v.optional(v.array(v.id("variableTags"))),
};

export const update = mutation({
  args: updateArgs,
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return updateCore(ctx, { ...args, updatedBy: actor._id });
  },
});

async function removeCore(
  ctx: MutationCtx,
  args: { variableId: Id<"environmentVariables">; deletedBy: Id<"users"> }
) {
  const now = Date.now();

  const variable = await ctx.db.get(args.variableId);
  if (!variable) {
    throw new Error("Variable not found");
  }

  const project = await ctx.db.get(variable.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  // Authorization: owner, or assigned PM / team lead
  await authorizeVariableAccess(ctx, {
    userId: args.deletedBy,
    projectId: variable.projectId,
    action: "project:delete_variable",
    preloadedProject: project,
  });

  // Idempotent no-op: a variable that's already soft-deleted must not be
  // re-patched (which would clobber the original deletedAt) or emit a
  // second "variable.deleted" audit row on a retried/duplicate call.
  if (variable.deletedAt !== undefined) {
    return args.variableId;
  }

  await ctx.db.patch(args.variableId, {
    deletedAt: now,
    updatedAt: now,
  });

  const allPermissions = await ctx.db
    .query("variablePermissions")
    .withIndex("by_variable", (q) => q.eq("variableId", args.variableId))
    .collect();
  const permissions = allPermissions.filter((perm) => perm.isActive);

  for (const perm of permissions) {
    await ctx.db.patch(perm._id, {
      isActive: false,
      revokedAt: now,
      revokedBy: args.deletedBy,
    });
  }

  // Revoke any active share links pointing at this variable — otherwise the
  // deleted variable's share stays live in Vault yet vanishes from the owner's
  // dashboard (list queries hide shares whose resource is gone).
  await revokeSharesForResource(ctx, {
    resourceType: "variable",
    variableId: args.variableId,
    actorId: args.deletedBy,
  });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: variable.projectId,
    variableId: args.variableId,
    userId: args.deletedBy,
    action: "variable.deleted",
    details: {
      key: variable.key,
      environments: variable.environments,
      isSensitive: variable.isSensitive,
      permissionsRevoked: permissions.length,
    },
    involvesSensitiveData: variable.isSensitive,
    resourceType: "variable",
  });

  return args.variableId;
}

/**
 * Atomically detach ONE environment from a shared variable — the value stays
 * live in the remaining environments. Reads and patches inside the mutation
 * (Convex serializable), so a concurrent environments edit can't be
 * clobbered by a stale client-side array. Refuses to detach the last
 * environment (use remove — trash — for that).
 */
export const removeFromEnvironment = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    environment: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt !== undefined) {
      throw new ConvexError("Variable not found");
    }
    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: variable.projectId,
      action: "project:delete_variable",
      preloadedProject: project,
    });

    if (!variable.environments.includes(args.environment)) {
      throw new ConvexError(
        `${variable.key} is not in ${args.environment} (current: ${variable.environments.join(", ")})`
      );
    }
    if (variable.environments.length === 1) {
      throw new ConvexError(
        `${variable.key} exists only in ${args.environment} — delete it instead`
      );
    }

    const now = Date.now();
    const environments = variable.environments.filter(
      (env) => env !== args.environment
    );
    await ctx.db.patch(args.variableId, { environments, updatedAt: now });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: actor._id,
      action: "variable.updated",
      details: {
        key: variable.key,
        removedEnvironment: args.environment,
        environments,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return args.variableId;
  },
});

const removeArgs = {
  variableId: v.id("environmentVariables"),
};

export const remove = mutation({
  args: removeArgs,
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    return removeCore(ctx, { ...args, deletedBy: actor._id });
  },
});

export const bulkDelete = mutation({
  args: {
    variableIds: v.array(v.id("environmentVariables")),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    if (args.variableIds.length === 0) {
      throw new Error("No variables specified");
    }
    if (args.variableIds.length > MAX_BULK_IMPORT_SIZE) {
      throw new Error(
        `Cannot bulk delete more than ${MAX_BULK_IMPORT_SIZE} variables at once`
      );
    }

    // Look up the first variable to determine project/org for authorization
    const firstVariable = await ctx.db.get(args.variableIds[0]);
    if (!firstVariable || firstVariable.deletedAt) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(firstVariable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead
    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: firstVariable.projectId,
      action: "project:delete_variable",
    });

    // Check bulk_delete feature gate
    const bulkDeleteCheck = await checkBooleanFeature(
      ctx.db,
      project.organizationId,
      "bulk_delete"
    );
    if (!bulkDeleteCheck.allowed) {
      throw new Error("Bulk delete is not available on your current tier.");
    }

    let deletedCount = 0;
    const deletedKeys: string[] = [];

    for (const variableId of args.variableIds) {
      const variable = await ctx.db.get(variableId);
      if (!variable || variable.deletedAt) continue;

      // Ensure all variables belong to the same project
      if (variable.projectId !== firstVariable.projectId) {
        throw new Error("All variables must belong to the same project");
      }

      // Soft delete
      await ctx.db.patch(variableId, {
        deletedAt: now,
        updatedAt: now,
      });

      // Revoke active permissions
      const allPermissions = await ctx.db
        .query("variablePermissions")
        .withIndex("by_variable", (q) => q.eq("variableId", variableId))
        .collect();
      const permissions = allPermissions.filter((perm) => perm.isActive);

      for (const perm of permissions) {
        await ctx.db.patch(perm._id, {
          isActive: false,
          revokedAt: now,
          revokedBy: actor._id,
        });
      }

      // Revoke active share links for each deleted variable (same reasoning as
      // the single-delete path in removeCore).
      await revokeSharesForResource(ctx, {
        resourceType: "variable",
        variableId,
        actorId: actor._id,
      });

      deletedKeys.push(variable.key);
      deletedCount++;
    }

    // Audit log
    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: firstVariable.projectId,
      userId: actor._id,
      action: "variable.deleted",
      details: {
        bulkOperation: true,
        deletedCount,
        deletedKeys,
        projectName: project.name,
      },
      resourceType: "variable",
    });

    return { deletedCount };
  },
});

export const restore = mutation({
  args: {
    variableId: v.id("environmentVariables"),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    if (!variable.deletedAt) {
      throw new Error("Variable is not deleted");
    }

    // Past the retention window the variable is purge-eligible: its vault
    // objects may be destroyed at any moment, so restoring would race the
    // GC and could resurrect a variable whose values no longer exist.
    if (variable.deletedAt < now - PURGE_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
      throw new Error(
        `Variable can no longer be restored — the ${PURGE_RETENTION_DAYS}-day retention window has passed and it is scheduled for permanent deletion.`
      );
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner, or assigned PM / team lead
    await authorizeVariableAccess(ctx, {
      userId: actor._id,
      projectId: variable.projectId,
      action: "project:delete_variable",
    });

    // Restoring must not break per-environment key uniqueness: a variable
    // with the same key may have been (re)created for these environments
    // while this one sat in the trash — resurrecting it would make pulls
    // nondeterministic for the clashing environment(s).
    const envClashes = await findEnvironmentConflicts(ctx, {
      projectId: variable.projectId,
      key: variable.key,
      environments: variable.environments,
    });
    if (envClashes.length > 0) {
      const where = envClashes
        .map(
          (clash) =>
            `${describeConflictSource(clash.source)} (${clash.environments.join(", ")})`
        )
        .join("; ");
      throw new ConvexError(
        `Cannot restore: variable "${variable.key}" already exists in ${where}. Delete or re-scope the active variable first.`
      );
    }

    await ctx.db.patch(args.variableId, {
      deletedAt: undefined,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: actor._id,
      action: "variable.restored",
      details: {
        key: variable.key,
        environments: variable.environments,
        deletedAt: variable.deletedAt,
        restoredAt: now,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return args.variableId;
  },
});

export const rollback = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    targetVersion: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const variable = await ctx.db.get(args.variableId);
    if (!variable || variable.deletedAt) {
      throw new Error("Variable not found");
    }

    const targetVersionRecord = await ctx.db
      .query("variableVersions")
      .withIndex("by_variable_and_version", (q) =>
        q.eq("variableId", args.variableId).eq("version", args.targetVersion)
      )
      .first();

    if (!targetVersionRecord) {
      throw new Error("Target version not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: owner only
    await assertOrgAction(
      ctx,
      actor._id,
      project.organizationId,
      "org:rollback_variable"
    );

    const newVersion = variable.version + 1;

    // Versions created since value updates started minting a fresh vault
    // object per change carry distinct vaultRefs, so this patch genuinely
    // restores the secret value. Legacy versions (written while updates
    // overwrote the vault object in place) share the variable's current
    // vaultRef — for those, only metadata is restored.
    const valueRestored = targetVersionRecord.vaultRef !== variable.vaultRef;

    await ctx.db.patch(args.variableId, {
      vaultRef: targetVersionRecord.vaultRef,
      description: targetVersionRecord.description,
      environments: targetVersionRecord.environments,
      version: newVersion,
      lastModifiedBy: actor._id,
      updatedAt: now,
    });

    await ctx.db.insert("variableVersions", {
      variableId: args.variableId,
      version: newVersion,
      vaultRef: targetVersionRecord.vaultRef,
      description: targetVersionRecord.description,
      environments: targetVersionRecord.environments,
      changedBy: actor._id,
      changeReason: `Rolled back to version ${args.targetVersion}`,
      createdAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: actor._id,
      action: "variable.rollback",
      details: {
        key: variable.key,
        environments: targetVersionRecord.environments,
        rollbackToVersion: args.targetVersion,
        previousVersion: variable.version,
        newVersion,
        valueRestored,
      },
      involvesSensitiveData: variable.isSensitive,
      resourceType: "variable",
    });

    return { variableId: args.variableId, valueRestored };
  },
});

/**
 * Log an access event for a variable (view / copy / export). Identity is the
 * verified WorkOS JWT — the CLI/extension call this via a setAuth'd Convex
 * client after decrypting a value through the vault route. Replaces the old
 * bearer `logAccessForToken`; this is its JWT twin.
 */
export const logAccess = mutation({
  args: {
    variableId: v.id("environmentVariables"),
    accessType: v.union(
      v.literal("view"),
      v.literal("copy"),
      v.literal("export")
    ),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    environment: v.optional(v.string()),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const variable = await ctx.db.get(args.variableId);
    if (!variable) {
      throw new Error("Variable not found");
    }

    const project = await ctx.db.get(variable.projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    // Authorization: anyone with effective access to this variable
    // (role-based write, or an active read/write grant)
    await requireVariableAccess(ctx, actor._id, variable, "read");

    await logVariableAccess(ctx, {
      organizationId: project.organizationId,
      projectId: variable.projectId,
      variableId: args.variableId,
      userId: actor._id,
      accessType: args.accessType,
      variableKey: variable.key,
      isSensitive: variable.isSensitive,
      environment: args.environment,
      ipAddress: args.ipAddress,
      userAgent: args.userAgent,
      sessionId: args.sessionId,
    });

    return true;
  },
});
