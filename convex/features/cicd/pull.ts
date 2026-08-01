import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createAuditLog } from "../../lib/audit";

/**
 * CI/CD secret pull — the GitHub Action's read path.
 *
 * Public action authenticated by the API key itself (the plaintext is
 * hashed here and looked up by the by_token_hash index — one indexed doc
 * read). Everything is one-shot HTTP: no reactive subscription ever holds
 * this read set open, so pulls cost exactly what they read, once.
 *
 * Per pull: 1 token doc + 1 project doc + gate resolution (~5 tiny docs) +
 * the project's ACTIVE variables in the requested environment (indexed,
 * bounded) + one vault decrypt per variable + 1 audit insert + 1 lastUsedAt
 * patch. Rate limited per key (cicdPull).
 */

/**
 * Authorize a pull and record it. Single mutation so the rate-limit check,
 * credential validation, tier gate, audit entry, and lastUsedAt update are
 * one atomic, cheap write — the action then only reads/decrypts.
 *
 * The credential is an apiKeys row (surfaces includes github_action) —
 * the legacy serviceTokens table was drained into apiKeys and retired, so
 * migrated and freshly minted credentials authenticate identically here.
 */
export const _authorizePull = internalMutation({
  args: {
    tokenHash: v.string(),
    environment: v.string(),
  },
  // Denials are RETURNED, not thrown: a throwing mutation rolls back its own
  // writes, which would erase the denial audit entry. The action maps
  // `denied` back onto the thrown error the route expects.
  returns: v.union(
    v.object({
      ok: v.literal(true),
      projectId: v.id("projects"),
      projectName: v.string(),
      projectSlug: v.string(),
    }),
    v.object({
      ok: v.literal(false),
      denied: v.union(
        v.literal("invalid_token"),
        v.literal("environment_scope"),
        // apiKeys credentials gate on public_api (the Action rides the
        // REST surface's flag)
        v.literal("tier_gate_public_api")
      ),
    })
  ),
  handler: async (ctx, args) => {
    // Rate limit keyed by the hash — throttles both real credentials and
    // brute-force probing of invalid ones. (Throws + rolls back: rate-limit
    // hits are deliberately NOT audited — a rejected burst would flood the
    // org's audit trail.) Re-thrown as a string-payload ConvexError: the
    // component's error carries object data that the secrets route can't
    // regex-match, which turned 429s into 500s in prod.
    try {
      await rateLimiter.limit(ctx, "cicdPull", {
        key: args.tokenHash,
        throws: true,
      });
    } catch (error) {
      if (isRateLimitError(error)) {
        throw new ConvexError(
          `Rate limit exceeded — retry after ${error.data.retryAfter}ms`
        );
      }
      throw error;
    }

    const now = Date.now();

    // ── apiKeys path (generalized platform) ──────────────────────────────
    const apiKey = await ctx.db
      .query("apiKeys")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    if (apiKey) {
      const logApiKeyDenied = async (reason: string): Promise<void> => {
        const scopedProjectId =
          apiKey.scopeProjects !== "all" && apiKey.scopeProjects.length === 1
            ? apiKey.scopeProjects[0]
            : undefined;
        const scopedProject = scopedProjectId
          ? await ctx.db.get(scopedProjectId)
          : null;
        const projectId =
          scopedProject?.organizationId === apiKey.organizationId &&
          scopedProject.deletedAt === undefined
            ? scopedProject._id
            : undefined;
        await createAuditLog(ctx, {
          organizationId: apiKey.organizationId,
          projectId,
          userId: apiKey.createdBy,
          action: "api.request_denied",
          details: {
            keyId: apiKey._id,
            keyName: apiKey.name,
            environment: args.environment,
            reason,
            source: "cicd_pull_compat",
          },
        });
      };

      // A REVOKED key being presented is the highest-signal denial.
      if (apiKey.revokedAt !== undefined) {
        await logApiKeyDenied("revoked_key_used");
        return { ok: false as const, denied: "invalid_token" as const };
      }

      // Expiry gets the same uniform "invalid" answer as revocation.
      if (apiKey.expiresAt !== undefined && apiKey.expiresAt <= now) {
        await logApiKeyDenied("expired_key_used");
        return { ok: false as const, denied: "invalid_token" as const };
      }

      // Surface scope: keys minted before the surfaces field (absent array)
      // stay valid here; explicit keys must include github_action. Same
      // uniform "invalid" answer as every other shape mismatch below.
      if (
        apiKey.surfaces !== undefined &&
        !apiKey.surfaces.includes("github_action")
      ) {
        await logApiKeyDenied("surface_out_of_scope");
        return { ok: false as const, denied: "invalid_token" as const };
      }

      // This legacy surface has no projectId argument — the project comes
      // entirely from the credential's scope, and it can only ever act on
      // ONE project's variables. Keys scoped to "all"/multiple projects, or
      // without "variables" in their resource scope, aren't shaped for it.
      if (apiKey.scopeProjects === "all") {
        await logApiKeyDenied("scope_not_single_project_variables");
        return { ok: false as const, denied: "invalid_token" as const };
      }
      if (
        !apiKey.scopeResources.includes("variables") ||
        apiKey.scopeProjects.length !== 1
      ) {
        await logApiKeyDenied("scope_not_single_project_variables");
        return { ok: false as const, denied: "invalid_token" as const };
      }
      const projectId = apiKey.scopeProjects[0];

      if (
        apiKey.scopeEnvironments !== "all" &&
        !apiKey.scopeEnvironments.includes(args.environment)
      ) {
        await logApiKeyDenied("environment_out_of_scope");
        return { ok: false as const, denied: "environment_scope" as const };
      }

      const project = await ctx.db.get(projectId);
      if (!project || project.deletedAt !== undefined) {
        await logApiKeyDenied("project_deleted");
        return { ok: false as const, denied: "invalid_token" as const };
      }

      // apiKeys credentials gate on `public_api` — the Action surface rides
      // the same flag as the REST API it pulls through (⚖️ PLAN D2).
      const gate = await checkBooleanFeature(
        ctx.db,
        apiKey.organizationId,
        "public_api"
      );
      if (!gate.allowed) {
        await logApiKeyDenied("tier_gate");
        return { ok: false as const, denied: "tier_gate_public_api" as const };
      }

      await ctx.db.patch(apiKey._id, { lastUsedAt: now });
      await ctx.db.insert("auditLogs", {
        organizationId: apiKey.organizationId,
        userId: apiKey.createdBy,
        action: "api.secrets_pulled",
        details: JSON.stringify({
          keyId: apiKey._id,
          keyName: apiKey.name,
          projectId,
          environment: args.environment,
          source: "cicd_pull_compat",
        }),
        createdAt: now,
      });

      return {
        ok: true as const,
        projectId,
        projectName: project.name,
        projectSlug: project.slug,
      };
    }

    // Unknown hash: nothing to attribute the attempt to — no audit
    // possible. The serviceTokens fallback that used to live here is gone:
    // the table was drained into apiKeys before its retirement.
    return { ok: false as const, denied: "invalid_token" as const };
  },
});

/**
 * Read the token-scoped variable set: ACTIVE rows only (index skips trash),
 * bounded, filtered to the requested environment. Returns key + vaultRef;
 * decryption happens in the action.
 */
export const _readScopedVariables = internalQuery({
  args: {
    projectId: v.id("projects"),
    environment: v.string(),
  },
  returns: v.array(
    v.object({
      key: v.string(),
      vaultRef: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    // Hard product bound with a LOUD failure — a silent partial pull would
    // let a CI run "succeed" while deploying with missing secrets. If a
    // project legitimately outgrows this, raise the bound deliberately.
    const MAX_PULL_VARIABLES = 1000;
    const variables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(MAX_PULL_VARIABLES + 1);

    if (variables.length > MAX_PULL_VARIABLES) {
      throw new ConvexError(
        `Project has more than ${MAX_PULL_VARIABLES} active variables — refusing a partial pull. Contact support to raise the limit.`
      );
    }

    return variables
      .filter((variable) => variable.environments.includes(args.environment))
      .map((variable) => ({
        key: variable.key,
        vaultRef: variable.vaultRef ?? null,
      }));
  },
});

export const pullSecrets = action({
  args: {
    token: v.string(),
    environment: v.string(),
  },
  returns: v.object({
    project: v.object({ name: v.string(), slug: v.string() }),
    environment: v.string(),
    variables: v.array(v.object({ key: v.string(), value: v.string() })),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    project: { name: string; slug: string };
    environment: string;
    variables: Array<{ key: string; value: string }>;
  }> => {
    if (!args.token.startsWith("envpk_")) {
      throw new ConvexError("Invalid or revoked service token");
    }

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(args.token)
    );
    const tokenHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const authorization:
      | {
          ok: true;
          projectId: import("../../_generated/dataModel").Id<"projects">;
          projectName: string;
          projectSlug: string;
        }
      | {
          ok: false;
          denied:
            | "invalid_token"
            | "environment_scope"
            | "tier_gate_public_api";
        } = await ctx.runMutation(internal.features.cicd.pull._authorizePull, {
      tokenHash,
      environment: args.environment,
    });

    // Denials come back as values (not throws) so their audit entries
    // survive the mutation — re-raise them here with the exact messages the
    // /api/v1/secrets route maps onto HTTP statuses.
    if (!authorization.ok) {
      if (authorization.denied === "environment_scope") {
        throw new ConvexError(
          `This token is not scoped to the "${args.environment}" environment`
        );
      }
      if (authorization.denied === "tier_gate_public_api") {
        // "Pro plan" phrase — the /api/v1/secrets route's 403 regex matches
        // it — naming the gate that actually denied the pull.
        throw new ConvexError(
          "The public API is available on the Pro plan — this organization's plan no longer includes it"
        );
      }
      throw new ConvexError("Invalid or revoked service token");
    }
    const scope = authorization;

    const rows = await ctx.runQuery(
      internal.features.cicd.pull._readScopedVariables,
      { projectId: scope.projectId, environment: args.environment }
    );

    const variables: Array<{ key: string; value: string }> = [];
    for (const row of rows) {
      let value = "";
      if (row.vaultRef) {
        try {
          value = await ctx.runAction(
            internal.features.vault.vault.readSecret,
            { vaultRef: row.vaultRef }
          );
        } catch (error) {
          // FAIL LOUDLY. Exporting a sentinel here would hand CI a broken
          // secret value that gets masked by the Action (setSecret) and
          // silently deployed. A failed decrypt must fail the pull — the
          // Action surfaces it via setFailed and the pipeline stops.
          console.error("cicd.pull.decryptFailed", {
            projectId: scope.projectId,
            key: row.key,
          });
          throw new ConvexError(
            `Failed to decrypt "${row.key}" — pull aborted (transient vault errors are retryable; persistent ones need the variable re-saved)`
          );
        }
      }
      variables.push({ key: row.key, value: value || "" });
    }

    return {
      project: { name: scope.projectName, slug: scope.projectSlug },
      environment: args.environment,
      variables,
    };
  },
});
