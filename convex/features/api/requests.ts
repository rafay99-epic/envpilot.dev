import { v, ConvexError, type Infer } from "convex/values";
import { action, internalQuery } from "../../_generated/server";
import { findKeyRequestByClientRef } from "../variables/requests/mutations";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
  hashToken,
  assertKeyFormat,
  consumeRateLimit,
  normalizeClientRef,
  throwForDenial,
  type Authorization,
} from "./helpers";

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

const REQUESTS_RESOURCE_DENIAL =
  'That resource is not in this API key\'s scope — filing requests needs the "requests" resource';

const surfaceArg = v.optional(
  v.union(v.literal("rest_api"), v.literal("mcp_server"))
);

const machineRequestShape = v.object({
  requestId: v.id("environmentVariableRequests"),
  key: v.string(),
  environments: v.array(v.string()),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("canceled")
  ),
  reviewReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
});
type MachineRequest = Infer<typeof machineRequestShape>;
type RequestStatus = MachineRequest["status"];

const filedRequestValidator = v.object({
  requestId: v.id("environmentVariableRequests"),
  status: v.union(
    v.literal("pending"),
    v.literal("approved"),
    v.literal("rejected"),
    v.literal("canceled")
  ),
  projectSlug: v.string(),
  message: v.string(),
});
type FiledRequest = Infer<typeof filedRequestValidator>;

const FILED_MESSAGE =
  "Request filed. A human reviewer approves it in the Envpilot dashboard and supplies the value; poll get_request_status or retry the read after approval.";

export const createVariableRequest = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    key: v.string(),
    environments: v.array(v.string()),
    justification: v.string(),
    isSensitive: v.optional(v.boolean()),
    clientRef: v.optional(v.string()),
    surface: surfaceArg,
  },
  returns: filedRequestValidator,
  handler: async (ctx, args): Promise<FiledRequest> => {
    assertKeyFormat(args.token);
    const clientRef = normalizeClientRef(args.clientRef);
    const tokenHash = await hashToken(args.token);

    if (clientRef !== undefined) {
      const existing: FiledRequest | null = await ctx.runQuery(
        internal.features.api.requests._findKeyRequestByClientRef,
        { tokenHash, clientRef }
      );
      if (existing) return existing;
    }

    // Strict per-key bucket BEFORE any authorize/DB work — a retry-looping
    // agent is blocked at the door, not after fanning out reviewer email.
    // (Keyed by the presented hash: this throttles a misbehaving CLIENT;
    // invalid-key probing is bounded the same way every other surface
    // bounds it — one cheap indexed miss per attempt.)
    await consumeRateLimit(ctx, "machineRequestCreate", tokenHash);

    // The slug resolves inside the core, so an out-of-scope project is
    // indistinguishable from a nonexistent one.
    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "requests" },
        projectSlug: args.projectSlug,
        surface: args.surface,
      }
    );
    if (!scoped.ok)
      throwForDenial(scoped.denied, {
        resourceScope: REQUESTS_RESOURCE_DENIAL,
      });
    const projectDoc = scoped.project;
    if (!projectDoc) throw new ConvexError("Project not found");

    // Requested environments must all fall inside the key's scope — the
    // scope data comes from _authorizeRequest, which only checks a single
    // environment per call. (Environment NAME validity is enforced in the
    // shared insertRequest core.)
    if (args.environments.length === 0) {
      throw new ConvexError("At least one environment is required");
    }
    const envScope = scoped.scopeEnvironments;
    if (envScope !== "all") {
      const outOfScope = args.environments.filter(
        (env) => !envScope.includes(env)
      );
      if (outOfScope.length > 0) {
        throw new ConvexError(
          "That environment is not in this API key's scope"
        );
      }
    }

    const filed: {
      requestId: Id<"environmentVariableRequests">;
      status: RequestStatus;
    } = await ctx.runMutation(
      internal.features.variables.requests.mutations._createFromKey,
      {
        keyId: scoped.keyId,
        projectId: projectDoc._id,
        key: args.key,
        environments: args.environments,
        justification: args.justification,
        isSensitive: args.isSensitive,
        clientRef,
      }
    );

    return { ...filed, projectSlug: projectDoc.slug, message: FILED_MESSAGE };
  },
});

export const _findKeyRequestByClientRef = internalQuery({
  args: { tokenHash: v.string(), clientRef: v.string() },
  handler: async (ctx, args): Promise<FiledRequest | null> => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();
    if (
      !key ||
      key.revokedAt !== undefined ||
      (key.expiresAt !== undefined && key.expiresAt <= Date.now())
    ) {
      return null;
    }
    const request = await findKeyRequestByClientRef(
      ctx,
      key.createdBy,
      key._id,
      args.clientRef
    );
    if (!request) return null;
    const project = await ctx.db.get(request.projectId);
    if (!project) return null;
    return {
      requestId: request._id,
      status: request.status,
      projectSlug: project.slug,
      message: FILED_MESSAGE,
    };
  },
});

const REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "canceled",
] as const;

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
  handler: async (ctx, args): Promise<MachineRequest[]> => {
    const toShape = (request: {
      _id: Id<"environmentVariableRequests">;
      key: string;
      environments: string[];
      status: "pending" | "approved" | "rejected" | "canceled";
      reviewReason?: string;
      createdAt: number;
    }): MachineRequest => ({
      requestId: request._id,
      key: request.key,
      environments: request.environments,
      status: request.status,
      reviewReason: request.reviewReason ?? null,
      createdAt: request.createdAt,
    });

    if (args.requestId !== undefined) {
      const request = await ctx.db.get(args.requestId);
      if (!request || request.requestedByKeyId !== args.keyId) return [];
      return [toShape(request)];
    }

    // Newest 20 of this key's requests. The index is (requestedByKeyId,
    // status), so a single unbound-status scan would order by STATUS before
    // recency — instead take a bounded newest-first window per status and
    // merge, so old rejected rows can never shadow a live pending one.
    const perStatus = await Promise.all(
      REQUEST_STATUSES.map((status) =>
        ctx.db
          .query("environmentVariableRequests")
          .withIndex("by_requested_key_and_status", (q) =>
            q.eq("requestedByKeyId", args.keyId).eq("status", status)
          )
          .order("desc")
          .take(20)
      )
    );
    return perStatus
      .flat()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map(toShape);
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
    if (!authorization.ok)
      throwForDenial(authorization.denied, {
        resourceScope: REQUESTS_RESOURCE_DENIAL,
      });

    return await ctx.runQuery(internal.features.api.requests._readKeyRequests, {
      keyId: authorization.keyId,
      requestId: args.requestId,
    });
  },
});
