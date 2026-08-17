import { v, ConvexError } from "convex/values";
import {
  WorkflowManager,
  vWorkflowId,
  type WorkflowId,
} from "@convex-dev/workflow";
import { components, internal } from "../../_generated/api";
import { internalAction, mutation } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { rateLimiter } from "../../lib/rateLimits";
import { MAX_BATCH_VARIABLES } from "../../lib/batchLimits";
import { pool, throttleProgress, VAULT_POOL_WIDTH } from "../../lib/pool";
import { vaultCreate, vaultDelete } from "../vault/vault";
import { findBatchInternalConflicts } from "../variables/helpers";
import { openBulkJob } from "../variables/bulkJobs";
import { createProjectCore, projectCreateArgs } from "./mutations";

/**
 * Create a project from a template, provisioning every template variable.
 *
 * Replaces the browser loop that posted one request per variable to
 * /api/variables. That shape paid for auth, user, project and membership
 * lookups once PER VARIABLE, and charged the per-call variableCreate rate
 * limit per variable, so anything past 30 in a minute vanished silently.
 *
 * Shape here:
 *   startFromTemplate (mutation, one round trip)
 *     - authorizes, creates the project, validates the whole batch,
 *       charges the batch rate limit ONCE, opens the progress job,
 *       starts the workflow, returns immediately.
 *   provisionVariables (workflow)
 *     1. write every value to the vault, pooled          [retryable]
 *     2. persist every row in ONE transaction
 *     3. close the job and notify
 *
 * The client never holds the connection: it gets a projectId back in one
 * round trip and watches `variables.bulkJobs.latestForProject`.
 */

const workflow = new WorkflowManager(components.workflow);

/**
 * A template variable SPEC. Note there is no `value` field, on purpose.
 *
 * Workflow arguments are journaled to the database, so a secret placed here
 * would be persisted outside the vault, which is the exact invariant the
 * vault architecture exists to hold. The spec carries the template's
 * non-secret `defaultValue` / `placeholder` hints and the workflow derives
 * the seed value itself, so there is no field a caller could put a real
 * secret into.
 */
const templateVariableSpec = v.object({
  key: v.string(),
  description: v.optional(v.string()),
  defaultValue: v.optional(v.string()),
  placeholder: v.optional(v.string()),
  environments: v.array(v.string()),
  isSensitive: v.optional(v.boolean()),
});

type TemplateVariableSpec = {
  key: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  environments: string[];
  isSensitive?: boolean;
};

/** The placeholder a freshly templated variable is seeded with. */
function seedValue(spec: TemplateVariableSpec): string {
  return spec.defaultValue || spec.placeholder || `<${spec.key}>`;
}

const KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

// ==========================================
// ENTRY POINT
// ==========================================

export const startFromTemplate = mutation({
  args: {
    ...projectCreateArgs,
    variables: v.array(templateVariableSpec),
  },
  returns: v.object({
    projectId: v.id("projects"),
    jobId: v.union(v.id("bulkJobs"), v.null()),
    workflowId: v.union(vWorkflowId, v.null()),
  }),
  // Explicit return type: the handler references this file's own entry in the
  // generated `internal` object, so inference would be circular.
  handler: async (
    ctx,
    args
  ): Promise<{
    projectId: Id<"projects">;
    jobId: Id<"bulkJobs"> | null;
    workflowId: WorkflowId | null;
  }> => {
    const { variables, ...projectArgs } = args;
    const actor = await requireAuthedUser(ctx);

    // Validate the batch BEFORE creating anything, so a malformed template
    // does not leave an empty project behind.
    if (variables.length > MAX_BATCH_VARIABLES) {
      throw new ConvexError(
        `A template may provision at most ${MAX_BATCH_VARIABLES} variables (received ${variables.length}).`
      );
    }
    for (const spec of variables) {
      if (!KEY_PATTERN.test(spec.key)) {
        throw new ConvexError(
          `"${spec.key}" is not a valid variable key. Use uppercase letters, digits and underscores, starting with a letter.`
        );
      }
      if (spec.environments.length === 0) {
        throw new ConvexError(
          `"${spec.key}" must belong to at least one environment.`
        );
      }
    }
    const clashes = findBatchInternalConflicts(variables);
    if (clashes.length > 0) {
      const first = clashes[0]!;
      throw new ConvexError(
        `This template defines "${first.key}" more than once for environment(s): ${first.clashes.join(", ")}. The same key is allowed only across non-overlapping environments.`
      );
    }

    // createProjectCore owns authorization, tier limits and slug uniqueness.
    const projectId = await createProjectCore(ctx, actor, projectArgs);

    // Charge the batch rate limit ONCE, here, and never inside the retryable
    // vault step: a retried step re-runs its body, so a charge in there would
    // bill an org twice for one transient vault failure and eventually lock
    // them out of a feature they are using correctly.
    //
    // After createProjectCore, not before: a slug collision or a tier refusal
    // must not spend tokens for work that never happened. The mutation is
    // transactional, so a throw here rolls the project row back with it.
    if (variables.length > 0) {
      await rateLimiter.limit(ctx, "variableBatchCreate", {
        key: projectArgs.organizationId,
        count: variables.length,
        throws: true,
      });
    }

    if (variables.length === 0) {
      return { projectId, jobId: null, workflowId: null };
    }

    const jobId = await openBulkJob(ctx, {
      organizationId: projectArgs.organizationId,
      projectId,
      kind: "template",
      total: variables.length,
      createdBy: actor._id,
    });

    const workflowId: WorkflowId = await workflow.start(
      ctx,
      internal.features.projects.fromTemplate.provisionVariables,
      {
        projectId,
        organizationId: projectArgs.organizationId,
        createdBy: actor._id,
        jobId,
        variables,
      }
    );

    return { projectId, jobId, workflowId };
  },
});

// ==========================================
// WORKFLOW
// ==========================================

export const provisionVariables = workflow.define({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    createdBy: v.id("users"),
    jobId: v.id("bulkJobs"),
    variables: v.array(templateVariableSpec),
  },
  handler: async (step, args): Promise<null> => {
    let refs: { key: string; vaultRef: string }[];

    // 1. Encrypt every value. Retried as a unit; safe because each write uses
    //    a deterministic idempotency key, so a retry reconciles to the object
    //    the first attempt created instead of minting a duplicate.
    try {
      refs = await step.runAction(
        internal.features.projects.fromTemplate.writeTemplateSecrets,
        {
          projectId: args.projectId,
          organizationId: args.organizationId,
          jobId: args.jobId,
          variables: args.variables,
        },
        { retry: true, name: "vault-batch" }
      );
    } catch (error) {
      await step.runMutation(internal.features.variables.bulkJobs._finish, {
        jobId: args.jobId,
        status: "failed",
        error: messageOf(error),
      });
      throw error;
    }

    // 2. Persist everything in ONE transaction. If it throws, no row exists,
    //    so every secret minted above is referenced by nothing and must go.
    try {
      await step.runMutation(internal.features.variables.mutations.createMany, {
        projectId: args.projectId,
        createdBy: args.createdBy,
        variables: args.variables.map((spec, i) => ({
          key: spec.key,
          vaultRef: refs[i]!.vaultRef,
          description: spec.description,
          environments: spec.environments,
          isSensitive: spec.isSensitive,
        })),
      });
    } catch (error) {
      await step.runAction(
        internal.features.projects.fromTemplate.discardSecrets,
        { vaultRefs: refs.map((r) => r.vaultRef) },
        { name: "vault-rollback" }
      );
      await step.runMutation(internal.features.variables.bulkJobs._finish, {
        jobId: args.jobId,
        status: "failed",
        error: messageOf(error),
      });
      throw error;
    }

    // 3. Close the job and notify. One summary per member, not one per
    //    variable per member.
    await step.runMutation(internal.features.variables.bulkJobs._finish, {
      jobId: args.jobId,
      status: "completed",
      completed: args.variables.length,
    });
    await step.runMutation(
      internal.features.variables.notifications.notifyBatchCreated,
      {
        projectId: args.projectId,
        actorId: args.createdBy,
        count: args.variables.length,
      }
    );

    return null;
  },
});

/** ConvexError payloads survive production redaction; plain Errors do not. */
function messageOf(error: unknown): string {
  if (error instanceof ConvexError) {
    // Payloads in this codebase are strings; anything else would render as
    // "[object Object]" in the progress banner.
    return typeof error.data === "string"
      ? error.data
      : JSON.stringify(error.data);
  }
  if (error instanceof Error) return error.message;
  return "Provisioning failed";
}

// ==========================================
// VAULT STEPS
// ==========================================

export const writeTemplateSecrets = internalAction({
  args: {
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    jobId: v.id("bulkJobs"),
    variables: v.array(templateVariableSpec),
  },
  returns: v.array(v.object({ key: v.string(), vaultRef: v.string() })),
  handler: async (ctx, args) => {
    // Progress writes are collected rather than left floating. An unawaited
    // promise in an action is not guaranteed to run once the action returns,
    // which is exactly the bug that made the old per-variable notification
    // emails nondeterministic. Awaiting them inside the pooled callback would
    // put a database round trip in the middle of the vault fan-out, so they
    // are fired in parallel and settled at the end instead.
    const pending: Promise<unknown>[] = [];
    const report = throttleProgress(args.variables.length, (completed) => {
      pending.push(
        ctx
          .runMutation(internal.features.variables.bulkJobs._progress, {
            jobId: args.jobId,
            completed,
          })
          // Progress is cosmetic; a failed counter bump must never fail the
          // provisioning it is reporting on.
          .catch(() => undefined)
      );
    });

    const minted: { key: string; vaultRef: string }[] = [];
    let refs: { key: string; vaultRef: string }[];
    try {
      refs = await pool(
        args.variables,
        VAULT_POOL_WIDTH,
        async (spec, index) => {
          const result = await vaultCreate({
            name: spec.key,
            value: seedValue(spec),
            organizationId: args.organizationId,
            projectId: args.projectId,
            // Deterministic per (job, position) so a retry of this step
            // rebuilds the same vault object name instead of a fresh one.
            // Sanitised because vaultCreate rejects anything outside
            // [A-Za-z0-9_-]; a document id that ever carried another
            // character would otherwise fail every template creation.
            //
            // Known gap: reconciliation-by-name only runs when the POST
            // itself failed. A step that succeeded but crashed before its
            // result was journaled re-POSTs and can leave one unreferenced
            // vault object behind. No data is lost or exposed; the object is
            // simply never read again.
            idempotencyKey: `${args.jobId}-${index}`.replace(
              /[^A-Za-z0-9_-]/g,
              "-"
            ),
          });
          const ref = { key: spec.key, vaultRef: result.id };
          minted.push(ref);
          return ref;
        },
        report
      );
    } catch (error) {
      // A partial fan-out leaves secrets nothing will ever reference. The
      // step is retryable, and the retry reconciles by idempotency key rather
      // than minting again, so cleaning up here is safe.
      await Promise.allSettled([
        ...pending,
        ...minted.map((r) => vaultDelete(r.vaultRef)),
      ]);
      throw error;
    }

    await Promise.allSettled(pending);
    return refs;
  },
});

export const discardSecrets = internalAction({
  args: { vaultRefs: v.array(v.string()) },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await pool(args.vaultRefs, VAULT_POOL_WIDTH, (ref) => vaultDelete(ref));
    return null;
  },
});

export type { TemplateVariableSpec };
