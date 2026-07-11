import { v } from "convex/values";
import { action, internalQuery } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { rateLimiter } from "../../lib/rateLimits";
import { isRateLimitError } from "@convex-dev/rate-limiter";
import { countActiveProjects } from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";

/**
 * Public REST API v1 — read actions.
 *
 * The ONE enforcement core every one of these calls through is
 * `internal.features.api.authorize._authorizeRequest` (PLAN §0: "One
 * enforcement core, three faces"). Nothing here re-implements auth, scope,
 * gating, or revocation/expiry checks — it hashes the bearer token, picks a
 * rate bucket, and defers the decision entirely to `_authorizeRequest`.
 *
 * Two-step authorization for slug-addressed resources (variables/accounts):
 * `_authorizeRequest`'s `requirement.projectId` is what enforces project
 * scope, but resolving a slug into a projectId requires knowing the key's
 * organizationId first — which itself only comes back from a successful
 * authorize call. So these endpoints call `_authorizeRequest` TWICE:
 *   1. `projectId` omitted — establishes the key is valid and in scope for
 *      the resource/environment/tier gate, and yields `organizationId`.
 *   2. The project is resolved (by org + slug) and `_authorizeRequest` is
 *      called again with `projectId` set — this is what actually enforces
 *      project scope, and (for real value/account pulls) carries the
 *      `recordUse` that patches `lastUsedAt` and inserts the audit entry.
 * A denial of `"project_scope"` on the second call is deliberately mapped to
 * the SAME "Project not found" error as an unknown slug (PLAN §2/§5: never
 * confirm a project's existence to a key that can't see it).
 *
 * Rate limiting mirrors cicd/pull.ts: picked by the CALLER before
 * authorizing (never inside `_authorizeRequest`), keyed by the token hash so
 * both real credentials and brute-force probing of invalid ones are capped.
 * Metadata reads (no vault decrypt) use the higher `apiMetadata` bucket and
 * skip `recordUse` entirely (PLAN §2: "metadata reads NOT audited — volume
 * noise"); value/account pulls reuse the `cicdPull` bucket/semantics and
 * always audit via `api.secrets_pulled`.
 */

// Hard product bound — LOUD failure on overflow, mirrors
// cicd/pull.ts's _readScopedVariables exactly. A silent partial read would
// let an integration "succeed" while missing secrets/accounts.
const MAX_PULL_ROWS = 1000;
// Mirrors projects/helpers.ts's listWithStatsCore VARIABLE_COUNT_CAP — a
// bounded reactive-safe count, not an exact total for pathological projects.
const VARIABLE_COUNT_CAP = 500;

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cheap format guard before any hashing/rate-limiting — mirrors cicd/pull.ts. */
function assertKeyFormat(token: string): void {
  if (!token.startsWith("envpk_")) {
    throw new Error("Invalid or revoked API key");
  }
}

type RateBucket = "apiMetadata" | "cicdPull";

/**
 * Consume one unit of the given bucket, keyed by the token hash. Re-throws a
 * plain Error carrying the retry-after duration in its message (rather than
 * letting the rate limiter's ConvexError cross the action/HTTP boundary
 * unchanged) so the Next.js route can regex-match it exactly like every
 * other denial and set a `Retry-After` header from the embedded ms value.
 */
async function consumeRateLimit(
  ctx: ActionCtx,
  bucket: RateBucket,
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

type Denied =
  | "invalid_key"
  | "resource_scope"
  | "environment_scope"
  | "project_scope"
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

/**
 * Map a denial from `_authorizeRequest` onto the SAME uniform error strings
 * the routes regex-match (PLAN §2's denial mapping). `project_scope` maps to
 * the SAME "Project not found" error as an unknown slug — PLAN §2/§5: an
 * out-of-scope project must never be distinguishable from a nonexistent one.
 * (In practice only the slug-resolved endpoints' second authorize call can
 * ever produce `project_scope` — the bootstrap call never sets
 * `requirement.projectId` — but handling it uniformly here means every call
 * site can just do `if (!x.ok) throwForDenial(x.denied)` without a
 * bespoke special case.)
 */
function throwForDenial(denied: Denied): never {
  if (denied === "invalid_key") {
    throw new Error("Invalid or revoked API key");
  }
  if (denied === "resource_scope") {
    throw new Error("That resource is not in this API key's scope");
  }
  if (denied === "environment_scope") {
    throw new Error("That environment is not in this API key's scope");
  }
  if (denied === "project_scope") {
    throw new Error("Project not found");
  }
  // tier_gate
  throw new Error(
    "The public API is available on the Pro plan — this organization's plan no longer includes it"
  );
}

function environmentAllowedByScope(
  variableEnvironments: string[],
  scope: "all" | string[]
): boolean {
  if (scope === "all") return true;
  return variableEnvironments.some((env) => scope.includes(env));
}

// ==========================================
// INTERNAL READS (bounded, indexed — no reactive subscriptions)
// ==========================================

export const _getOrganizationSummary = internalQuery({
  args: { organizationId: v.id("organizations") },
  returns: v.union(
    v.object({
      name: v.string(),
      slug: v.string(),
      plan: v.string(),
      projectCount: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.organizationId);
    if (!org) return null;
    const [projectCount, gateContext] = await Promise.all([
      countActiveProjects(ctx.db, args.organizationId),
      resolveOrgGateContext(ctx.db, args.organizationId),
    ]);
    return {
      name: org.name,
      slug: org.slug,
      plan: gateContext.effectiveTier,
      projectCount,
    };
  },
});

export const _listScopedProjects = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      slug: v.string(),
      variableCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    let projects = await ctx.db
      .query("projects")
      .withIndex("by_organization", (q) =>
        q.eq("organizationId", args.organizationId)
      )
      .collect()
      .then((rows) => rows.filter((p) => p.deletedAt === undefined));

    if (args.scopeProjects !== "all") {
      const allowed = new Set(args.scopeProjects.map((id) => id as string));
      projects = projects.filter((p) => allowed.has(p._id as string));
    }

    return await Promise.all(
      projects.map(async (project) => {
        const activeVariables = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project_deleted", (q) =>
            q.eq("projectId", project._id).eq("deletedAt", undefined)
          )
          .take(VARIABLE_COUNT_CAP);
        return {
          name: project.name,
          slug: project.slug,
          variableCount: activeVariables.length,
        };
      })
    );
  },
});

export const _countActiveVariablesForProject = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const activeVariables = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(VARIABLE_COUNT_CAP);
    return activeVariables.length;
  },
});

export const _readActiveVariables = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      key: v.string(),
      vaultRef: v.string(),
      environments: v.array(v.string()),
      isSensitive: v.boolean(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("environmentVariables")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(MAX_PULL_ROWS + 1);

    if (rows.length > MAX_PULL_ROWS) {
      throw new Error(
        `Project has more than ${MAX_PULL_ROWS} active variables — refusing a partial pull. Contact support to raise the limit.`
      );
    }

    return rows.map((r) => ({
      key: r.key,
      vaultRef: r.vaultRef,
      environments: r.environments,
      isSensitive: r.isSensitive,
      updatedAt: r.updatedAt,
    }));
  },
});

export const _readActiveAccounts = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      name: v.string(),
      vaultRef: v.string(),
      websiteUrl: v.optional(v.string()),
      environments: v.array(v.string()),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectAccounts")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(MAX_PULL_ROWS + 1);

    if (rows.length > MAX_PULL_ROWS) {
      throw new Error(
        `Project has more than ${MAX_PULL_ROWS} active accounts — refusing a partial pull. Contact support to raise the limit.`
      );
    }

    return rows.map((r) => ({
      name: r.name,
      vaultRef: r.vaultRef,
      websiteUrl: r.websiteUrl,
      environments: r.environments,
      updatedAt: r.updatedAt,
    }));
  },
});

// ==========================================
// PUBLIC ACTIONS
// ==========================================

export const getOrganization = action({
  args: { token: v.string() },
  returns: v.object({
    name: v.string(),
    slug: v.string(),
    plan: v.string(),
    projectCount: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    name: string;
    slug: string;
    plan: string;
    projectCount: number;
  }> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      { tokenHash, requirement: { resource: "projects" } }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    const summary = await ctx.runQuery(
      internal.features.api.reads._getOrganizationSummary,
      { organizationId: authorization.organizationId }
    );
    if (!summary) throw new Error("Organization not found");
    return summary;
  },
});

export const listProjects = action({
  args: { token: v.string() },
  returns: v.array(
    v.object({
      name: v.string(),
      slug: v.string(),
      variableCount: v.number(),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<Array<{ name: string; slug: string; variableCount: number }>> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      { tokenHash, requirement: { resource: "projects" } }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    return await ctx.runQuery(internal.features.api.reads._listScopedProjects, {
      organizationId: authorization.organizationId,
      scopeProjects: authorization.scopeProjects,
    });
  },
});

export const getProject = action({
  args: { token: v.string(), projectSlug: v.string() },
  returns: v.object({
    name: v.string(),
    slug: v.string(),
    variableCount: v.number(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ name: string; slug: string; variableCount: number }> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      { tokenHash, requirement: { resource: "projects" } }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      api.features.projects.queries.getBySlug,
      {
        organizationId: bootstrap.organizationId,
        slug: args.projectSlug,
      }
    );
    if (!projectDoc) throw new Error("Project not found");

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "projects", projectId: projectDoc._id },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);

    const variableCount = await ctx.runQuery(
      internal.features.api.reads._countActiveVariablesForProject,
      { projectId: projectDoc._id }
    );

    return {
      name: projectDoc.name,
      slug: projectDoc.slug,
      variableCount,
    };
  },
});

export const getProjectVariables = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    environment: v.optional(v.string()),
    keys: v.optional(v.array(v.string())),
    prefix: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      key: v.string(),
      value: v.optional(v.string()),
      environments: v.array(v.string()),
      isSensitive: v.boolean(),
      updatedAt: v.number(),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      key: string;
      value?: string;
      environments: string[];
      isSensitive: boolean;
      updatedAt: number;
    }>
  > => {
    assertKeyFormat(args.token);
    const metadataOnly = args.metadataOnly ?? false;
    if (!metadataOnly && !args.environment) {
      throw new Error(
        "Missing required param: environment (or pass metadata_only=true)"
      );
    }

    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(
      ctx,
      metadataOnly ? "apiMetadata" : "cicdPull",
      tokenHash
    );

    // Step 1: bootstrap — resource/environment/tier gate, no project yet.
    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "variables", environment: args.environment },
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      api.features.projects.queries.getBySlug,
      {
        organizationId: bootstrap.organizationId,
        slug: args.projectSlug,
      }
    );
    if (!projectDoc) throw new Error("Project not found");

    // Step 2: project-scoped — this is what actually enforces project scope,
    // and (for real value pulls) records the audit entry + lastUsedAt patch.
    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: {
          resource: "variables",
          environment: args.environment,
          projectId: projectDoc._id,
        },
        recordUse: metadataOnly
          ? undefined
          : {
              auditAction: "api.secrets_pulled",
              details: JSON.stringify({
                keyId: bootstrap.keyId,
                projectId: projectDoc._id,
                projectSlug: args.projectSlug,
                environment: args.environment,
                keys: args.keys,
                prefix: args.prefix,
                source: "public-api",
              }),
            },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);

    const rows = await ctx.runQuery(
      internal.features.api.reads._readActiveVariables,
      { projectId: projectDoc._id }
    );

    const keySet = args.keys ? new Set(args.keys) : null;
    const filtered = rows.filter((row) => {
      if (
        !environmentAllowedByScope(row.environments, scoped.scopeEnvironments)
      )
        return false;
      if (args.environment && !row.environments.includes(args.environment))
        return false;
      if (keySet && !keySet.has(row.key)) return false;
      if (args.prefix && !row.key.startsWith(args.prefix)) return false;
      return true;
    });

    const results: Array<{
      key: string;
      value?: string;
      environments: string[];
      isSensitive: boolean;
      updatedAt: number;
    }> = [];
    for (const row of filtered) {
      if (metadataOnly) {
        results.push({
          key: row.key,
          environments: row.environments,
          isSensitive: row.isSensitive,
          updatedAt: row.updatedAt,
        });
        continue;
      }
      let value: string;
      try {
        value = await ctx.runAction(internal.features.vault.vault.readSecret, {
          vaultRef: row.vaultRef,
        });
      } catch (error) {
        console.error("api.reads.getProjectVariables.decryptFailed", {
          projectId: projectDoc._id,
          key: row.key,
        });
        throw new Error(
          `Failed to decrypt "${row.key}" — pull aborted (transient vault errors are retryable; persistent ones need the variable re-saved)`
        );
      }
      results.push({
        key: row.key,
        value,
        environments: row.environments,
        isSensitive: row.isSensitive,
        updatedAt: row.updatedAt,
      });
    }

    return results;
  },
});

export const getProjectAccounts = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    environment: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      name: v.string(),
      websiteUrl: v.optional(v.string()),
      environments: v.array(v.string()),
      updatedAt: v.number(),
      username: v.optional(v.string()),
      password: v.optional(v.string()),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      name: string;
      websiteUrl?: string;
      environments: string[];
      updatedAt: number;
      username?: string;
      password?: string;
    }>
  > => {
    assertKeyFormat(args.token);
    const metadataOnly = args.metadataOnly ?? false;

    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(
      ctx,
      metadataOnly ? "apiMetadata" : "cicdPull",
      tokenHash
    );

    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "accounts", environment: args.environment },
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      api.features.projects.queries.getBySlug,
      {
        organizationId: bootstrap.organizationId,
        slug: args.projectSlug,
      }
    );
    if (!projectDoc) throw new Error("Project not found");

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: {
          resource: "accounts",
          environment: args.environment,
          projectId: projectDoc._id,
        },
        recordUse: metadataOnly
          ? undefined
          : {
              auditAction: "api.secrets_pulled",
              details: JSON.stringify({
                keyId: bootstrap.keyId,
                projectId: projectDoc._id,
                projectSlug: args.projectSlug,
                environment: args.environment,
                resource: "accounts",
                source: "public-api",
              }),
            },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);

    const rows = await ctx.runQuery(
      internal.features.api.reads._readActiveAccounts,
      {
        projectId: projectDoc._id,
      }
    );

    const filtered = rows.filter((row) => {
      if (
        !environmentAllowedByScope(row.environments, scoped.scopeEnvironments)
      )
        return false;
      if (args.environment && !row.environments.includes(args.environment))
        return false;
      return true;
    });

    const results: Array<{
      name: string;
      websiteUrl?: string;
      environments: string[];
      updatedAt: number;
      username?: string;
      password?: string;
    }> = [];
    for (const row of filtered) {
      if (metadataOnly) {
        results.push({
          name: row.name,
          websiteUrl: row.websiteUrl,
          environments: row.environments,
          updatedAt: row.updatedAt,
        });
        continue;
      }
      let raw: string;
      try {
        raw = await ctx.runAction(internal.features.vault.vault.readSecret, {
          vaultRef: row.vaultRef,
        });
      } catch (error) {
        console.error("api.reads.getProjectAccounts.decryptFailed", {
          projectId: projectDoc._id,
          account: row.name,
        });
        throw new Error(
          `Failed to decrypt account "${row.name}" — pull aborted (transient vault errors are retryable; persistent ones need the account re-saved)`
        );
      }
      let credentials: { username?: string; password?: string } = {};
      try {
        const parsed = JSON.parse(raw) as {
          username?: string;
          password?: string;
        };
        credentials = { username: parsed.username, password: parsed.password };
      } catch (error) {
        console.error("api.reads.getProjectAccounts.malformedVaultPayload", {
          projectId: projectDoc._id,
          account: row.name,
        });
        throw new Error(
          `Failed to decrypt account "${row.name}" — pull aborted (transient vault errors are retryable; persistent ones need the account re-saved)`
        );
      }
      results.push({
        name: row.name,
        websiteUrl: row.websiteUrl,
        environments: row.environments,
        updatedAt: row.updatedAt,
        username: credentials.username,
        password: credentials.password,
      });
    }

    return results;
  },
});
