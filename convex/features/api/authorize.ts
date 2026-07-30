import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { surfaceValidator } from "./keys";

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
      // One of VALID_RESOURCES (keys.ts) — e.g. "variables", "accounts", "artifacts"
      resource: v.string(),
      environment: v.optional(v.string()),
      projectId: v.optional(v.id("projects")),
    }),
    // Present only for calls that should record usage (value pulls); absent
    // for metadata reads, which skip both the lastUsedAt patch and the audit
    // insert entirely (PLAN §2: "metadata reads NOT audited — volume noise").
    recordUse: v.optional(
      v.object({
        auditAction: v.union(
          v.literal("api.secrets_pulled"),
          v.literal("artifact.accessed")
        ),
        details: v.string(),
      })
    ),
    // Which registry flag gates this surface: REST checks public_api
    // (default), the MCP server passes "mcp_server". Both are pro-tier but
    // separately priceable (⚖️ PLAN §7.1).
    // DEPRECATED in favor of `surface` (which implies the gate) — kept so
    // web builds deployed before this convex deploy keep working; callers
    // migrated to `surface` may omit it.
    gateFeature: v.optional(
      v.union(v.literal("public_api"), v.literal("mcp_server"))
    ),
    // Which surface is presenting the key. Enforced against the key's
    // `surfaces` array (absent array = grandfathered key, valid everywhere).
    // Optional only for the deploy window where older web builds don't pass
    // it — those calls fall back to inferring the surface from gateFeature.
    surface: v.optional(surfaceValidator),
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
        v.literal("surface_scope"),
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

    // Surface scope. Keys minted before the surfaces field exist without it
    // and stay valid on every surface (they were minted under that
    // behavior); new keys are always explicit. Older web builds may not
    // pass `surface` yet — infer it from gateFeature (the only pre-surface
    // caller that isn't plain REST is the MCP server).
    //
    // KNOWN LIMIT: `surface` is caller-asserted, not transport-derived —
    // the reads/requests actions are the shared backend of both HTTP
    // surfaces, so a key holder calling Convex directly can claim either
    // surface. The field segments well-behaved surfaces (a leaked Action
    // key stays useless on REST/MCP routes); the hard security boundary
    // remains the key's resource/environment/project scope + tier gates,
    // which no claimed surface can widen.
    const surface =
      args.surface ??
      (args.gateFeature === "mcp_server" ? "mcp_server" : "rest_api");
    if (key.surfaces !== undefined && !key.surfaces.includes(surface)) {
      await logDenied(key, "surface_out_of_scope");
      return { ok: false as const, denied: "surface_scope" as const };
    }

    // "organization" is a PSEUDO-RESOURCE: org-level metadata (name, slug,
    // plan, bounded counts) is readable by ANY valid key of the org — the
    // key holder inherently knows which org their key belongs to, and the
    // discovery endpoint must work for narrowly-scoped keys.
    if (
      args.requirement.resource !== "organization" &&
      !key.scopeResources.includes(args.requirement.resource)
    ) {
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
    // working rather than grandfathering silent access forever. When a
    // surface is given it ALONE decides the gate (github_action rides
    // public_api — the Action hits /api/v1/secrets); gateFeature is only a
    // fallback for pre-surface callers. Never honor a mismatched pair — a
    // caller must not check the mcp_server surface against the public_api
    // gate (or vice versa) to outlive its own surface's gate being off.
    const gate = await checkBooleanFeature(
      ctx.db,
      key.organizationId,
      args.surface !== undefined
        ? args.surface === "mcp_server"
          ? "mcp_server"
          : "public_api"
        : (args.gateFeature ?? "public_api")
    );
    if (!gate.allowed) {
      await logDenied(key, "tier_gate");
      return { ok: false as const, denied: "tier_gate" as const };
    }

    if (args.recordUse) {
      // lastUsedAt is a coarse "recently active" signal for the keys UI —
      // sub-minute precision is worthless, and patching the key row on
      // every pull makes parallel pulls with one key OCC-contend on it.
      // Skip the write when it's already fresh; audit logging below is
      // unconditional and unaffected.
      if (!key.lastUsedAt || now - key.lastUsedAt >= 60_000) {
        await ctx.db.patch(key._id, { lastUsedAt: now });
      }
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
