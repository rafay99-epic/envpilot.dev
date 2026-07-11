import { v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { rateLimiter } from "../../lib/rateLimits";
import { checkBooleanFeature } from "../featureRegistry/gates";

/**
 * CI/CD secret pull — the GitHub Action's read path.
 *
 * Public action authenticated by the service token itself (the plaintext is
 * hashed here and looked up by the by_token_hash index — one indexed doc
 * read). Everything is one-shot HTTP: no reactive subscription ever holds
 * this read set open, so pulls cost exactly what they read, once.
 *
 * Per pull: 1 token doc + 1 project doc + gate resolution (~5 tiny docs) +
 * the project's ACTIVE variables in the requested environment (indexed,
 * bounded) + one vault decrypt per variable + 1 audit insert + 1 lastUsedAt
 * patch. Rate limited per token (cicdPull).
 */

/**
 * Authorize a pull and record it. Single mutation so the rate-limit check,
 * token validation, tier gate, audit entry, and lastUsedAt update are one
 * atomic, cheap write — the action then only reads/decrypts.
 */
export const _authorizePull = internalMutation({
  args: {
    tokenHash: v.string(),
    environment: v.string(),
  },
  returns: v.object({
    projectId: v.id("projects"),
    projectName: v.string(),
    projectSlug: v.string(),
  }),
  handler: async (ctx, args) => {
    // Rate limit keyed by the hash — throttles both real tokens and
    // brute-force probing of invalid ones.
    await rateLimiter.limit(ctx, "cicdPull", {
      key: args.tokenHash,
      throws: true,
    });

    const token = await ctx.db
      .query("serviceTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first();

    // One error message for missing AND revoked — don't leak which.
    if (!token || token.revokedAt !== undefined) {
      throw new Error("Invalid or revoked service token");
    }

    if (!token.environments.includes(args.environment)) {
      throw new Error(
        `This token is not scoped to the "${args.environment}" environment`
      );
    }

    const project = await ctx.db.get(token.projectId);
    if (!project || project.deletedAt !== undefined) {
      throw new Error("Invalid or revoked service token");
    }

    // Tier gate re-checked on every pull: a downgraded org's tokens stop
    // working rather than grandfathering silent access forever.
    const gate = await checkBooleanFeature(
      ctx.db,
      token.organizationId,
      "cicd_service_tokens"
    );
    if (!gate.allowed) {
      throw new Error(
        "CI/CD service tokens are available on the Pro plan — this organization's plan no longer includes them"
      );
    }

    const now = Date.now();
    await ctx.db.patch(token._id, { lastUsedAt: now });
    await ctx.db.insert("auditLogs", {
      organizationId: token.organizationId,
      userId: token.createdBy,
      action: "cicd.secrets_pulled",
      details: JSON.stringify({
        tokenId: token._id,
        tokenName: token.name,
        projectId: token.projectId,
        environment: args.environment,
      }),
      createdAt: now,
    });

    return {
      projectId: token.projectId,
      projectName: project.name,
      projectSlug: project.slug,
    };
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
      throw new Error(
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
      throw new Error("Invalid or revoked service token");
    }

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(args.token)
    );
    const tokenHash = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const scope: {
      projectId: import("../../_generated/dataModel").Id<"projects">;
      projectName: string;
      projectSlug: string;
    } = await ctx.runMutation(internal.features.cicd.pull._authorizePull, {
      tokenHash,
      environment: args.environment,
    });

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
          throw new Error(
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
