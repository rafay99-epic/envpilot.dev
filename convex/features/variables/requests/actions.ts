import { v, ConvexError } from "convex/values";
import { action } from "../../../_generated/server";
import { api, internal } from "../../../_generated/api";
import { Id } from "../../../_generated/dataModel";

const requestUserValidator = v.union(
  v.object({
    _id: v.id("users"),
    email: v.string(),
    name: v.optional(v.string()),
  }),
  v.null()
);

/**
 * Replaces POST /api/cli/variable-requests AND POST /api/extension/variable-requests.
 *
 * Encrypts the proposed value into WorkOS Vault, then creates the request with
 * the returned ref. Authorization mirrors the routes: the caller must be a
 * developer assigned to the project (owners / PMs / team leads create variables
 * directly and are rejected here; grant-only / unassigned users are blocked).
 * Returns the created request (trimmed to the fields the CLI/extension consume,
 * vaultRef intentionally omitted).
 */
export const createWithValue = action({
  args: {
    projectId: v.id("projects"),
    key: v.string(),
    value: v.string(),
    environments: v.array(v.string()),
    isSensitive: v.optional(v.boolean()),
    description: v.optional(v.string()),
  },
  returns: v.object({
    _id: v.id("environmentVariableRequests"),
    key: v.string(),
    description: v.optional(v.string()),
    environments: v.array(v.string()),
    projectId: v.id("projects"),
    organizationId: v.id("organizations"),
    isSensitive: v.boolean(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("canceled")
    ),
    reviewReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    requester: requestUserValidator,
    reviewer: requestUserValidator,
  }),
  // Explicit return type breaks the same-module circular inference caused by
  // referencing api.features.variables.requests.{mutations.create,queries.getById} from within this module.
  handler: async (
    ctx,
    args
  ): Promise<{
    _id: Id<"environmentVariableRequests">;
    key: string;
    description?: string;
    environments: string[];
    projectId: Id<"projects">;
    organizationId: Id<"organizations">;
    isSensitive: boolean;
    status: "pending" | "approved" | "rejected" | "canceled";
    reviewReason?: string;
    createdAt: number;
    updatedAt: number;
    requester: { _id: Id<"users">; email: string; name?: string } | null;
    reviewer: { _id: Id<"users">; email: string; name?: string } | null;
  }> => {
    const project = await ctx.runQuery(
      internal.features.projects.queries._getById,
      {
        projectId: args.projectId,
      }
    );
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const membership = await ctx.runQuery(
      api.features.organizations.queries.getMembership,
      {
        organizationId: project.organizationId,
      }
    );
    if (!membership) {
      throw new ConvexError("You are not a member of this organization");
    }

    const legacy = await ctx.runQuery(
      api.features.auth.queries.resolveLegacyRoles,
      {
        projectId: args.projectId,
      }
    );

    if (!legacy.assigned) {
      if (legacy.grantOnly) {
        throw new ConvexError(
          "You have Viewer access to this project. Variable requests are not allowed."
        );
      }
      throw new ConvexError(
        "You are not assigned to this project. Variable requests are not allowed."
      );
    }

    // Owners, project managers, and team leads should create directly.
    if (legacy.role !== "developer") {
      throw new ConvexError(
        "You have direct write access. Use direct variable creation instead of submitting a request."
      );
    }

    // Encrypt the proposed value first — the mutation only ever stores a ref.
    const vault = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: args.key,
        value: args.value,
        organizationId: project.organizationId,
        projectId: args.projectId,
      }
    );

    // If the validating mutation rejects, the freshly-minted vault object would
    // be orphaned (an encrypted secret with no owning row) — delete it so Vault
    // and Convex stay consistent. Best-effort; vaultGc reconciles any straggler.
    let requestId;
    try {
      requestId = await ctx.runMutation(
        api.features.variables.requests.mutations.create,
        {
          key: args.key,
          vaultRef: vault.id,
          description: args.description,
          environments: args.environments,
          projectId: args.projectId,
          isSensitive: args.isSensitive ?? false,
        }
      );
    } catch (mutationError) {
      try {
        await ctx.runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: vault.id,
        });
      } catch {
        // Best-effort — vaultGc reconciles any straggler.
      }
      throw mutationError;
    }

    const created = await ctx.runQuery(
      api.features.variables.requests.queries.getById,
      {
        requestId,
      }
    );
    if (!created) {
      throw new ConvexError("Failed to load the created variable request");
    }

    // Trim to the fields the CLI/extension parse (drops vaultRef / _creationTime
    // / review metadata that clients ignore).
    return {
      _id: created._id,
      key: created.key,
      description: created.description,
      environments: created.environments,
      projectId: created.projectId,
      organizationId: created.organizationId,
      isSensitive: created.isSensitive,
      status: created.status,
      reviewReason: created.reviewReason,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      requester: created.requester,
      reviewer: created.reviewer,
    };
  },
});

/**
 * Replaces the WorkOS Vault read path of GET /api/variable-requests/[id]/value.
 *
 * Reveals a request's proposed secret value. Authorization is delegated entirely
 * to getById, which throws unless the caller is the requester OR a reviewer
 * (owner / assigned project manager / team lead) of the request's project. The
 * plaintext is fetched on demand from WorkOS Vault and is NEVER logged.
 */
export const revealValue = action({
  args: { requestId: v.id("environmentVariableRequests") },
  returns: v.object({ value: v.string() }),
  handler: async (ctx, args): Promise<{ value: string }> => {
    const request = await ctx.runQuery(
      api.features.variables.requests.queries.getById,
      {
        requestId: args.requestId,
      }
    );
    if (!request) {
      throw new ConvexError("Variable request not found");
    }
    if (request.vaultRef === undefined) {
      throw new ConvexError(
        "This request has no proposed value — the reviewer supplies one at approval"
      );
    }

    const value = await ctx.runAction(
      internal.features.vault.vault.readSecret,
      {
        vaultRef: request.vaultRef,
      }
    );

    return { value };
  },
});

/**
 * Approve a VALUELESS (machine-originated) request, supplying the value the
 * agent could not: encrypt the reviewer's plaintext into WorkOS Vault, then
 * run the normal review mutation with the fresh ref. All review
 * authorization (reviewer capability, pending status, origin-key liveness,
 * conflict/tier checks) lives in the mutation — this wrapper exists only
 * because vault encryption is action-only. Mirrors createWithValue's
 * orphan cleanup: if the mutation rejects, the freshly minted vault object
 * is deleted (best-effort; vaultGc reconciles stragglers).
 */
export const approveWithValue = action({
  args: {
    requestId: v.id("environmentVariableRequests"),
    value: v.string(),
    reviewReason: v.optional(v.string()),
    environments: v.optional(v.array(v.string())),
  },
  returns: v.object({
    requestId: v.id("environmentVariableRequests"),
    status: v.literal("approved"),
    variableId: v.id("environmentVariables"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    requestId: Id<"environmentVariableRequests">;
    status: "approved";
    variableId: Id<"environmentVariables">;
  }> => {
    const request = await ctx.runQuery(
      api.features.variables.requests.queries.getById,
      { requestId: args.requestId }
    );
    if (!request) {
      throw new ConvexError("Variable request not found");
    }
    // Preflight the cheap checks BEFORE the Vault write so obviously
    // doomed calls never mint a secret object. The review mutation remains
    // the authorization of record (reviewer capability, key liveness), and
    // its rejection still triggers the orphan cleanup below.
    if (request.status !== "pending") {
      throw new ConvexError(`Request has already been ${request.status}`);
    }
    if (request.vaultRef !== undefined) {
      throw new ConvexError(
        "A value can only be supplied when approving a request that has none"
      );
    }

    const vault = await ctx.runAction(
      internal.features.vault.vault.createSecret,
      {
        name: request.key,
        value: args.value,
        organizationId: request.organizationId,
        projectId: request.projectId,
      }
    );

    let result;
    try {
      result = await ctx.runMutation(
        internal.features.variables.requests.mutations._approveWithSuppliedRef,
        {
          requestId: args.requestId,
          reviewReason: args.reviewReason,
          environments: args.environments,
          vaultRef: vault.id,
        }
      );
    } catch (mutationError) {
      try {
        await ctx.runAction(internal.features.vault.vault.deleteSecret, {
          vaultRef: vault.id,
        });
      } catch {
        // Best-effort — vaultGc reconciles any straggler.
      }
      throw mutationError;
    }

    if (result.status !== "approved" || !("variableId" in result)) {
      throw new ConvexError("Approval did not complete");
    }
    return {
      requestId: args.requestId,
      status: "approved" as const,
      variableId: result.variableId,
    };
  },
});
