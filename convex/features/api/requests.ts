import { v } from "convex/values";
import { action, internalQuery } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";

/**
 * Machine-initiated variable requests — the ONE mutating capability a key
 * can carry ("requests" ∈ scopeResources; MCP/REST surfaces only, never
 * github_action). An agent that needs a variable it cannot read files a
 * request with a justification; a human with `project.requests.review`
 * approves it in the dashboard and supplies the value. Keys never write
 * secrets — this is the whole escalation model.
 *
 * Authorization routes through the SAME `_authorizeRequest` core as every
 * read surface (resource "requests" + the key's project/environment scope);
 * the machine-specific bounds (open-pendings cap, rejection cooldown, tier
 * pre-check) and the shared conflict/dedupe/insert core live in
 * variables/requests/mutations.ts::_createFromKey.
 *
 * vaultRef NEVER appears in anything returned here — a machine credential
 * must not receive a capability handle for a value it may not read.
 */

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function assertKeyFormat(token: string): void {
  if (!token.startsWith("envpk_")) {
    throw new Error("Invalid or revoked API key");
  }
}

type Denied =
  | "invalid_key"
  | "resource_scope"
  | "environment_scope"
  | "project_scope"
  | "surface_scope"
  | "tier_gate";

type Authorization =
  | {
      ok: true;
      organizationId: Id<"organizations">;
      scopeProjects: "all" | Id<"projects">[];
      scopeEnvironments: "all" | string[];
      scopeResources: string[];
      keyId: Id<"apiKeys">;
    }
  | { ok: false; denied: Denied };

function throwForDenial(denied: Denied): never {
  if (denied === "invalid_key") {
    throw new Error("Invalid or revoked API key");
  }
  if (denied === "resource_scope") {
    throw new Error(
      'That resource is not in this API key\'s scope — filing requests needs the "requests" resource'
    );
  }
  if (denied === "environment_scope") {
    throw new Error("That environment is not in this API key's scope");
  }
  if (denied === "project_scope") {
    throw new Error("Project not found");
  }
  if (denied === "surface_scope") {
    throw new Error("This API key is not enabled for this surface");
  }
  throw new Error(
    "The public API is available on the Pro plan — this organization's plan no longer includes it"
  );
}

const surfaceArg = v.optional(
  v.union(v.literal("rest_api"), v.literal("mcp_server"))
);

const requestStatusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("canceled")
);

const machineRequestShape = v.object({
  requestId: v.id("environmentVariableRequests"),
  key: v.string(),
  environments: v.array(v.string()),
  status: requestStatusValidator,
  reviewReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

type MachineRequest = {
  requestId: Id<"environmentVariableRequests">;
  key: string;
  environments: string[];
  status: "pending" | "approved" | "rejected" | "canceled";
  reviewReason: string | null;
  createdAt: number;
};

/**
 * Consume one unit of a bucket, keyed by the token hash — mirrors
 * reads.ts's consumeRateLimit (rate limiting always runs BEFORE any
 * authorize/DB work, capping brute-force probing too).
 */
async function consumeRateLimit(
  ctx: ActionCtx,
  bucket: "apiMetadata" | "machineRequestCreate",
  tokenHash: string
): Promise<void> {
  try {
    await rateLimiter.limit(ctx, bucket, { key: tokenHash, throws: true });
  } catch (error) {
    if (isRateLimitError(error)) {
      throw new Error(
        `Rate limit exceeded — retry after ${error.data.retryAfter}ms`
      );
    }
    throw error;
  }
}

export const createVariableRequest = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    key: v.string(),
    environments: v.array(v.string()),
    justification: v.string(),
    isSensitive: v.optional(v.boolean()),
    surface: surfaceArg,
  },
  returns: v.object({
    requestId: v.id("environmentVariableRequests"),
    status: v.literal("pending"),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    requestId: Id<"environmentVariableRequests">;
    status: "pending";
    message: string;
  }> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);

    // Strict per-key bucket BEFORE any authorize/DB work — a retry-looping
    // agent is blocked at the door, not after fanning out reviewer email.
    await consumeRateLimit(ctx, "machineRequestCreate", tokenHash);

    // Bootstrap authorize (no project yet), then resolve slug → projectId
    // and authorize AGAIN with it — identical two-step to reads.ts, so an
    // out-of-scope project is indistinguishable from a nonexistent one.
    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "requests" },
        surface: args.surface,
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      api.features.projects.queries.getBySlug,
      { organizationId: bootstrap.organizationId, slug: args.projectSlug }
    );
    if (!projectDoc) throw new Error("Project not found");

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "requests", projectId: projectDoc._id },
        surface: args.surface,
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);

    // Requested environments must all fall inside the key's scope — the
    // scope data comes from _authorizeRequest, which only checks a single
    // environment per call.
    if (args.environments.length === 0) {
      throw new Error("At least one environment is required");
    }
    if (scoped.scopeEnvironments !== "all") {
      const outOfScope = args.environments.filter(
        (env) =>
          scoped.scopeEnvironments !== "all" &&
          !scoped.scopeEnvironments.includes(env)
      );
      if (outOfScope.length > 0) {
        throw new Error("That environment is not in this API key's scope");
      }
    }

    const requestId: Id<"environmentVariableRequests"> = await ctx.runMutation(
      internal.features.variables.requests.mutations._createFromKey,
      {
        keyId: scoped.keyId,
        projectId: projectDoc._id,
        key: args.key,
        environments: args.environments,
        justification: args.justification,
        isSensitive: args.isSensitive,
      }
    );

    return {
      requestId,
      status: "pending" as const,
      message:
        "Request filed — a human reviewer must approve it in the Envpilot dashboard and supply the value. Tell the user to review it, then poll get_request_status or simply retry the read after approval.",
    };
  },
});

/**
 * A key may read the status of ITS OWN requests only — never another
 * key's, never a human's, and never any vaultRef.
 */
export const _readKeyRequests = internalQuery({
  args: {
    keyId: v.id("apiKeys"),
    requestId: v.optional(v.id("environmentVariableRequests")),
  },
  returns: v.array(machineRequestShape),
  handler: async (ctx, args) => {
    if (args.requestId !== undefined) {
      const request = await ctx.db.get(args.requestId);
      if (!request || request.requestedByKeyId !== args.keyId) return [];
      return [
        {
          requestId: request._id,
          key: request.key,
          environments: request.environments,
          status: request.status,
          reviewReason: request.reviewReason ?? null,
          createdAt: request.createdAt,
        },
      ];
    }
    // Newest 20 of this key's requests — enough for any agent loop.
    const rows = await ctx.db
      .query("environmentVariableRequests")
      .withIndex("by_requested_key_and_status", (q) =>
        q.eq("requestedByKeyId", args.keyId)
      )
      .order("desc")
      .take(20);
    return rows.map((request) => ({
      requestId: request._id,
      key: request.key,
      environments: request.environments,
      status: request.status,
      reviewReason: request.reviewReason ?? null,
      createdAt: request.createdAt,
    }));
  },
});

export const getRequestStatus = action({
  args: {
    token: v.string(),
    // Omit to list this key's recent requests.
    requestId: v.optional(v.id("environmentVariableRequests")),
    surface: surfaceArg,
  },
  returns: v.array(machineRequestShape),
  handler: async (ctx, args): Promise<MachineRequest[]> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    // Status polls ride the shared metadata bucket.
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "requests" },
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    return await ctx.runQuery(internal.features.api.requests._readKeyRequests, {
      keyId: authorization.keyId,
      requestId: args.requestId,
    });
  },
});
