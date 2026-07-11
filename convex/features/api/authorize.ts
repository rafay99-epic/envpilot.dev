import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * THE single enforcement core for the public API key platform.
 *
 * One function every surface calls — the REST API, the MCP server, and
 * (indirectly, via a compat lookup) the legacy CI/CD pull endpoint all
 * authenticate through `_authorizeRequest`. New surfaces never re-implement
 * authorization; they hash their bearer credential and call this.
 *
 * Denials are RETURNED, not thrown: a throwing mutation rolls back its own
 * writes, which would erase the denial audit entry. Callers map `ok: false`
 * back onto whatever HTTP status / MCP error shape their surface uses.
 *
 * Rate limiting is deliberately NOT here — callers pick their own bucket
 * (metadata vs value-pull vs accounts-pull) before calling this, exactly
 * like cicd/pull.ts's `cicdPull` limiter sits in the caller, not here.
 */
export const _authorizeRequest = internalMutation({
  args: {
    tokenHash: v.string(),
    requirement: v.object({
      // One of VALID_RESOURCES (keys.ts) — e.g. "variables", "accounts", "projects"
      resource: v.string(),
      environment: v.optional(v.string()),
      projectId: v.optional(v.id("projects")),
    }),
    // Present only for calls that should record usage (value pulls); absent
    // for metadata reads, which skip both the lastUsedAt patch and the audit
    // insert entirely (PLAN §2: "metadata reads NOT audited — volume noise").
    recordUse: v.optional(
      v.object({
        auditAction: v.literal("api.secrets_pulled"),
        details: v.string(),
      })
    ),
    // Which registry flag gates this surface: REST checks public_api
    // (default), the MCP server passes "mcp_server". Both are pro-tier but
    // separately priceable (⚖️ PLAN §7.1).
    gateFeature: v.optional(
      v.union(v.literal("public_api"), v.literal("mcp_server"))
    ),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      organizationId: v.id("organizations"),
      scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
      scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
      scopeResources: v.array(v.string()),
      keyId: v.id("apiKeys"),
    }),
    v.object({
      ok: v.literal(false),
      denied: v.union(
        v.literal("invalid_key"),
        v.literal("resource_scope"),
        v.literal("environment_scope"),
        v.literal("project_scope"),
        v.literal("tier_gate")
      ),
    })
  ),
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    const now = Date.now();
    const logDenied = async (
      k: NonNullable<typeof key>,
      reason: string
    ): Promise<void> => {
      await ctx.db.insert("auditLogs", {
        organizationId: k.organizationId,
        userId: k.createdBy,
        action: "api.request_denied",
        details: JSON.stringify({
          keyId: k._id,
          keyName: k.name,
          requirement: args.requirement,
          reason,
        }),
        createdAt: now,
      });
    };

    // Unknown hash: nothing to attribute the attempt to — no audit possible.
    if (!key) {
      return { ok: false as const, denied: "invalid_key" as const };
    }

    // A REVOKED key being presented is the highest-signal denial: someone
    // (or some pipeline) is still holding a credential that was cut off.
    if (key.revokedAt !== undefined) {
      await logDenied(key, "revoked_key_used");
      return { ok: false as const, denied: "invalid_key" as const };
    }

    // Expiry gets the SAME uniform "invalid" answer as revocation — an
    // expired key is not a distinct signal from a revoked one to the caller.
    if (key.expiresAt !== undefined && key.expiresAt <= now) {
      await logDenied(key, "expired_key_used");
      return { ok: false as const, denied: "invalid_key" as const };
    }

    if (!key.scopeResources.includes(args.requirement.resource)) {
      await logDenied(key, "resource_out_of_scope");
      return { ok: false as const, denied: "resource_scope" as const };
    }

    if (
      args.requirement.environment !== undefined &&
      key.scopeEnvironments !== "all" &&
      !key.scopeEnvironments.includes(args.requirement.environment)
    ) {
      await logDenied(key, "environment_out_of_scope");
      return { ok: false as const, denied: "environment_scope" as const };
    }

    if (
      args.requirement.projectId !== undefined &&
      key.scopeProjects !== "all" &&
      !key.scopeProjects.includes(args.requirement.projectId)
    ) {
      await logDenied(key, "project_out_of_scope");
      return { ok: false as const, denied: "project_scope" as const };
    }

    // Tier gate re-checked on every request: a downgraded org's keys stop
    // working rather than grandfathering silent access forever.
    const gate = await checkBooleanFeature(
      ctx.db,
      key.organizationId,
      args.gateFeature ?? "public_api"
    );
    if (!gate.allowed) {
      await logDenied(key, "tier_gate");
      return { ok: false as const, denied: "tier_gate" as const };
    }

    if (args.recordUse) {
      await ctx.db.patch(key._id, { lastUsedAt: now });
      await ctx.db.insert("auditLogs", {
        organizationId: key.organizationId,
        userId: key.createdBy,
        action: args.recordUse.auditAction,
        details: args.recordUse.details,
        createdAt: now,
      });
    }

    return {
      ok: true as const,
      organizationId: key.organizationId,
      scopeProjects: key.scopeProjects,
      scopeEnvironments: key.scopeEnvironments,
      scopeResources: key.scopeResources,
      keyId: key._id,
    };
  },
});
