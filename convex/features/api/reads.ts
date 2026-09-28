import { v, ConvexError } from "convex/values";
import { MAX_PROJECT_FILES } from "../../lib/fileLimits";
import { resolveEffectiveVariables } from "../variables/resolve";
import { activeProjectsQuery } from "../../lib/projectKind";
import {
  action,
  internalQuery,
  internalMutation,
} from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { countActiveProjects } from "../featureRegistry/gates";
import { resolveOrgGateContext } from "../featureRegistry/resolver";
import {
  hashToken,
  assertKeyFormat,
  consumeRateLimit,
  throwForDenial,
  type Authorization,
} from "./helpers";
import { open as openSealedFile, toBase64 } from "../files/crypto";
import { get as blobStoreGet } from "../files/blobStore";
import { vaultReadWithRetry } from "../vault/vault";
import { pool, VAULT_POOL_WIDTH } from "../../lib/pool";

/**
 * Public REST API v1 — read actions.
 *
 * The ONE enforcement core every one of these calls through is
 * `internal.features.api.authorize._authorizeRequest` (PLAN §0: "One
 * enforcement core, three faces"). Nothing here re-implements auth, scope,
 * gating, or revocation/expiry checks — it hashes the bearer token, picks a
 * rate bucket, and defers the decision entirely to `_authorizeRequest`.
 *
 * Slug-addressed resources pass `projectSlug` to `_authorizeRequest`, which
 * resolves it inside the key's organization and enforces project scope in
 * the same call. An unknown slug and an out-of-scope project both map to
 * "Project not found" (PLAN §2/§5: never confirm a project's existence to a
 * key that can't see it).
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
const MAX_PULL_ROWS = MAX_PROJECT_FILES;
// Mirrors projects/helpers.ts's listWithStatsCore VARIABLE_COUNT_CAP — a
// bounded reactive-safe count, not an exact total for pathological projects.
const VARIABLE_COUNT_CAP = 500;

function requireResolvedProject(
  authorization: Extract<Authorization, { ok: true }>
): { _id: Id<"projects">; name: string; slug: string } {
  if (!authorization.project) throw new ConvexError("Project not found");
  return authorization.project;
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
    // Workspaces are excluded at the index: an API key must never see one
    // listed as a project, and slug lookup returns null if one is targeted.
    let projects = await activeProjectsQuery(
      ctx.db,
      args.organizationId
    ).collect();

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
    // Resolves the project's own rows PLUS everything it inherits from the
    // workspaces it belongs to. Server side, so the CLI, extension, REST,
    // MCP, GitHub Action and Docker image all pick workspaces up without a
    // client release.
    const rows = await resolveEffectiveVariables(ctx, {
      projectId: args.projectId,
    });

    if (rows.length > MAX_PULL_ROWS) {
      throw new ConvexError(
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
      throw new ConvexError(
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

/**
 * Active secret files for a project.
 *
 * Metadata only — the vault ref and storage id come with it so the calling
 * action can decrypt, but nothing here reads a blob. Same bounded,
 * refuse-partial contract as variables and accounts: a project past the cap
 * fails loudly rather than handing back a silently truncated set, which for
 * a build pulling signing material would fail much later and far less
 * obviously.
 */
export const _readActiveFiles = internalQuery({
  args: { projectId: v.id("projects") },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      mode: v.string(),
      size: v.number(),
      sha256: v.string(),
      contentType: v.optional(v.string()),
      environments: v.array(v.string()),
      updatedAt: v.number(),
      vaultRef: v.string(),
      storageId: v.id("_storage"),
    })
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("projectFiles")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).eq("deletedAt", undefined)
      )
      .take(MAX_PULL_ROWS + 1);

    if (rows.length > MAX_PULL_ROWS) {
      throw new ConvexError(
        `Project has more than ${MAX_PULL_ROWS} active secret files — refusing a partial pull. Contact support to raise the limit.`
      );
    }

    return rows.map((r) => ({
      name: r.name,
      path: r.path,
      mode: r.mode ?? "0600",
      size: r.size,
      sha256: r.sha256,
      contentType: r.contentType,
      environments: r.environments,
      updatedAt: r.updatedAt,
      vaultRef: r.vaultRef,
      storageId: r.storageId,
    }));
  },
});

/** One audit row per secret file returned by an API/MCP content pull. */
export const _logFilePulls = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    userId: v.id("apiKeys"),
    files: v.array(v.object({ path: v.string(), name: v.string() })),
    environment: v.optional(v.string()),
    /**
     * The surface that actually presented the secret. Server-derived from
     * the authorized request, never a caller-supplied string.
     */
    surface: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.userId);
    if (!key) return null;
    const now = Date.now();
    // ONE mutation for the whole pull, not one per file. Awaiting a round
    // trip inside the decrypt loop meant a 200-file pull paid 200 of them
    // and could spend most of the action's budget writing audit rows.
    for (const file of args.files) {
      await ctx.db.insert("auditLogs", {
        organizationId: args.organizationId,
        projectId: args.projectId,
        userId: key.createdBy,
        action: "file.downloaded",
        details: JSON.stringify({
          keyId: args.userId,
          path: file.path,
          fileName: file.name,
          environment: args.environment,
          // "public-api" for every surface could not answer "which surface
          // exposed the production signing key" — REST, MCP and the Action
          // are different blast radii.
          source: args.surface,
        }),
        createdAt: now,
      });
    }
    return null;
  },
});

// ==========================================
// PUBLIC ACTIONS
// ==========================================

// Which registry flag gates a call: the REST routes never pass this (default
// "public_api" inside authorize.ts); the MCP server passes "mcp_server" for
// every tool call so the SAME actions serve both surfaces without
// duplicating the auth/scope/gate/rate-limit/audit logic (PLAN §0/§3).
const gateFeatureArg = v.optional(
  v.union(v.literal("public_api"), v.literal("mcp_server"))
);

// Which surface is presenting the key — enforced against the key's
// `surfaces` array in authorize.ts. The MCP server passes "mcp_server";
// REST routes omit it and rely on authorize.ts's inference fallback
// (surface absent + no mcp gateFeature = "rest_api"), which also covers
// calls from web builds predating this field.
const surfaceArg = v.optional(
  v.union(
    v.literal("rest_api"),
    v.literal("mcp_server"),
    // The files route IS the Action's pull path, so a github_action-scoped
    // key has to be able to present that surface — otherwise the scope the
    // key form now allows would be denied at CI time.
    v.literal("github_action"),
    // The Docker image reads variables and files through these same actions,
    // but declares itself so authorize.ts checks the docker_image gate rather
    // than public_api. Without this it would silently ride the REST gate.
    v.literal("docker")
  )
);

/**
 * Which bucket a VALUE-returning pull charges.
 *
 * Docker gets its own so a restarting container fleet cannot exhaust the
 * budget CI deploys depend on, and vice versa — the same independence the
 * docker_image tier gate gives the surface. Metadata reads never come here;
 * they charge apiMetadata regardless of surface.
 */
function valueBucket(surface: string | undefined): "cicdPull" | "dockerPull" {
  return surface === "docker" ? "dockerPull" : "cicdPull";
}

export const getOrganization = action({
  args: { token: v.string(), gateFeature: gateFeatureArg, surface: surfaceArg },
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
      {
        tokenHash,
        requirement: { resource: "organization" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    const summary = await ctx.runQuery(
      internal.features.api.reads._getOrganizationSummary,
      { organizationId: authorization.organizationId }
    );
    if (!summary) throw new ConvexError("Organization not found");
    return summary;
  },
});

export const listProjects = action({
  args: { token: v.string(), gateFeature: gateFeatureArg, surface: surfaceArg },
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
      {
        tokenHash,
        requirement: { resource: "projects" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    return await ctx.runQuery(internal.features.api.reads._listScopedProjects, {
      organizationId: authorization.organizationId,
      scopeProjects: authorization.scopeProjects,
    });
  },
});

export const getProject = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
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

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "projects" },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);
    const projectDoc = requireResolvedProject(scoped);

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
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
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
      throw new ConvexError(
        "Missing required param: environment (or pass metadata_only=true)"
      );
    }

    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(
      ctx,
      metadataOnly ? "apiMetadata" : valueBucket(args.surface),
      tokenHash
    );

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "variables", environment: args.environment },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
        recordUse: metadataOnly
          ? undefined
          : {
              auditAction: "api.secrets_pulled",
              details: JSON.stringify({
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
    const projectDoc = requireResolvedProject(scoped);

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

    if (metadataOnly) {
      return filtered.map((row) => ({
        key: row.key,
        environments: row.environments,
        isSensitive: row.isSensitive,
        updatedAt: row.updatedAt,
      }));
    }

    return await pool(filtered, VAULT_POOL_WIDTH, async (row) => {
      let value: string;
      try {
        value = await vaultReadWithRetry(row.vaultRef);
      } catch {
        console.error("api.reads.getProjectVariables.decryptFailed", {
          projectId: projectDoc._id,
          key: row.key,
        });
        throw new ConvexError(
          `Failed to decrypt "${row.key}" — pull aborted (transient vault errors are retryable; persistent ones need the variable re-saved)`
        );
      }
      return {
        key: row.key,
        value,
        environments: row.environments,
        isSensitive: row.isSensitive,
        updatedAt: row.updatedAt,
      };
    });
  },
});

export const getProjectAccounts = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    environment: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
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
      metadataOnly ? "apiMetadata" : valueBucket(args.surface),
      tokenHash
    );

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "accounts", environment: args.environment },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
        recordUse: metadataOnly
          ? undefined
          : {
              auditAction: "api.secrets_pulled",
              details: JSON.stringify({
                projectSlug: args.projectSlug,
                environment: args.environment,
                resource: "accounts",
                source: "public-api",
              }),
            },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);
    const projectDoc = requireResolvedProject(scoped);

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

    if (metadataOnly) {
      return filtered.map((row) => ({
        name: row.name,
        websiteUrl: row.websiteUrl,
        environments: row.environments,
        updatedAt: row.updatedAt,
      }));
    }

    return await pool(filtered, VAULT_POOL_WIDTH, async (row) => {
      let raw: string;
      try {
        raw = await vaultReadWithRetry(row.vaultRef);
      } catch {
        console.error("api.reads.getProjectAccounts.decryptFailed", {
          projectId: projectDoc._id,
          account: row.name,
        });
        throw new ConvexError(
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
      } catch {
        console.error("api.reads.getProjectAccounts.malformedVaultPayload", {
          projectId: projectDoc._id,
          account: row.name,
        });
        throw new ConvexError(
          `Failed to decrypt account "${row.name}" — pull aborted (transient vault errors are retryable; persistent ones need the account re-saved)`
        );
      }
      return {
        name: row.name,
        websiteUrl: row.websiteUrl,
        environments: row.environments,
        updatedAt: row.updatedAt,
        username: credentials.username,
        password: credentials.password,
      };
    });
  },
});

/**
 * Secret files for a project, over the public API / MCP surface.
 *
 * RBAC, in the order it is enforced:
 *   1. The key must be valid, unrevoked and unexpired.
 *   2. Its `surfaces` must include the presenting surface (REST vs MCP).
 *   3. Its `scopeResources` must include "files" — never granted by default,
 *      so a key reaches file content only because its creator deliberately
 *      ticked that box.
 *   4. Its `scopeEnvironments` and `scopeProjects` must admit this request.
 *   5. The tier gate for the surface must still be on.
 * Every one of those is `_authorizeRequest`, the same core the REST API, the
 * MCP server and the GitHub Action all share — no surface re-implements it.
 *
 * `metadataOnly` returns path/size/checksum and never touches the vault or
 * the blob store, so an agent can see WHICH files a build needs without any
 * of them being decrypted. Content pulls are rate-limited on the heavier
 * bucket and written to the audit log individually.
 */
export const getProjectFiles = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    environment: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
    /** Restrict to these destination paths (an agent fetching one keystore). */
    paths: v.optional(v.array(v.string())),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: v.array(
    v.object({
      name: v.string(),
      path: v.string(),
      mode: v.string(),
      size: v.number(),
      sha256: v.string(),
      contentType: v.optional(v.string()),
      environments: v.array(v.string()),
      updatedAt: v.number(),
      /** base64; omitted when metadataOnly. */
      content: v.optional(v.string()),
    })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    Array<{
      name: string;
      path: string;
      mode: string;
      size: number;
      sha256: string;
      contentType?: string;
      environments: string[];
      updatedAt: number;
      content?: string;
    }>
  > => {
    assertKeyFormat(args.token);
    const metadataOnly = args.metadataOnly ?? false;
    // Server-derived from the SAME value authorize.ts enforced the key
    // against — never a caller-supplied label. MIRRORS its fallback exactly:
    // a legacy MCP caller sends only gateFeature, and defaulting those to
    // rest_api mis-attributed every file it pulled.
    const auditSurface =
      args.surface ??
      (args.gateFeature === "mcp_server" ? "mcp_server" : "rest_api");

    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(
      ctx,
      metadataOnly ? "apiMetadata" : valueBucket(args.surface),
      tokenHash
    );

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "files", environment: args.environment },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
        recordUse: metadataOnly
          ? undefined
          : {
              auditAction: "api.secrets_pulled",
              details: JSON.stringify({
                projectSlug: args.projectSlug,
                environment: args.environment,
                resource: "files",
                source: "public-api",
              }),
            },
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);
    const projectDoc = requireResolvedProject(scoped);

    const rows = await ctx.runQuery(
      internal.features.api.reads._readActiveFiles,
      { projectId: projectDoc._id }
    );

    const wanted = args.paths ? new Set(args.paths) : null;
    const filtered = rows.filter((row) => {
      if (
        !environmentAllowedByScope(row.environments, scoped.scopeEnvironments)
      )
        return false;
      if (args.environment && !row.environments.includes(args.environment))
        return false;
      if (wanted && !wanted.has(row.path)) return false;
      return true;
    });

    // Convex caps a function return at 16 MiB and base64 inflates by 1.33x.
    // Each file is individually within its tier limit, but several together
    // can blow the ceiling and fail the WHOLE pull with an opaque
    // serialization error. Refuse up front with a message that says what to
    // do instead.
    const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
    if (!metadataOnly) {
      const total = filtered.reduce((n, r) => n + r.size, 0);
      if (total > MAX_CONTENT_BYTES) {
        throw new ConvexError(
          `Requested secret files total ${Math.ceil(total / 1024 / 1024)} MB, over the ${MAX_CONTENT_BYTES / 1024 / 1024} MB per-request cap — pass \`paths\` to fetch them individually.`
        );
      }
    }

    const results: Array<{
      name: string;
      path: string;
      mode: string;
      size: number;
      sha256: string;
      contentType?: string;
      environments: string[];
      updatedAt: number;
      content?: string;
    }> = [];

    for (const row of filtered) {
      const meta = {
        name: row.name,
        path: row.path,
        mode: row.mode,
        size: row.size,
        sha256: row.sha256,
        contentType: row.contentType,
        environments: row.environments,
        updatedAt: row.updatedAt,
      };

      if (metadataOnly) {
        results.push(meta);
        continue;
      }

      // Envelope: the blob is useless without the vault key, so both have to
      // resolve. Either failing aborts the WHOLE pull — a build that gets
      // some of its signing material and not the rest fails later and far
      // more confusingly than one that fails here.
      let plaintext: Uint8Array;
      try {
        const ciphertext = await blobStoreGet(ctx, row.storageId);
        const keyMaterial = await vaultReadWithRetry(row.vaultRef);
        plaintext = await openSealedFile(ciphertext, keyMaterial);
      } catch (error) {
        console.error("api.reads.getProjectFiles.decryptFailed", {
          projectId: projectDoc._id,
          file: row.path,
        });
        throw new ConvexError(
          `Failed to decrypt secret file "${row.path}" — pull aborted (transient vault errors are retryable; persistent ones need the file re-uploaded)`
        );
      }

      results.push({ ...meta, content: toBase64(plaintext) });
    }

    // One entry PER FILE, written in ONE mutation after every decrypt. The
    // per-file granularity is what lets the trail answer "who pulled the
    // production signing key"; batching the write is what keeps a large
    // pull from spending its action budget on round trips.
    //
    // CONTENT pulls only. A metadata listing returns no plaintext, so
    // recording it as `file.downloaded` both lies about what happened and —
    // now that the Action always lists before pulling — doubles the rows for
    // every real pull.
    if (!metadataOnly && results.length > 0) {
      await ctx.runMutation(internal.features.api.reads._logFilePulls, {
        organizationId: scoped.organizationId,
        projectId: projectDoc._id,
        userId: scoped.keyId,
        files: results.map((r) => ({ path: r.path, name: r.name })),
        environment: args.environment,
        surface: auditSurface,
      });
    }

    return results;
  },
});

const SEARCH_MAX_PROJECTS = 20;
const SEARCH_MAX_RESULTS = 100;
const SEARCH_ROW_BUDGET = 8000;

const searchResultValidator = v.object({
  results: v.array(
    v.object({
      projectSlug: v.string(),
      projectName: v.string(),
      matchType: v.union(v.literal("project"), v.literal("variable")),
      key: v.optional(v.string()),
    })
  ),
  truncated: v.boolean(),
  skippedProjects: v.number(),
});

type SearchResult = {
  results: Array<{
    projectSlug: string;
    projectName: string;
    matchType: "project" | "variable";
    key?: string;
  }>;
  truncated: boolean;
  skippedProjects: number;
};

export const _searchScoped = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    scopeEnvironments: v.union(v.literal("all"), v.array(v.string())),
    includeKeys: v.boolean(),
    query: v.string(),
  },
  returns: searchResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    let projects = await activeProjectsQuery(
      ctx.db,
      args.organizationId
    ).collect();
    if (args.scopeProjects !== "all") {
      const allowed = new Set<string>(args.scopeProjects);
      projects = projects.filter((p) => allowed.has(p._id));
    }

    const needle = args.query.toLowerCase();
    const scanned = projects.slice(0, SEARCH_MAX_PROJECTS);
    const results: SearchResult["results"] = [];
    let skippedProjects = args.includeKeys ? 0 : scanned.length;
    let rowsRead = 0;

    for (const project of scanned) {
      if (results.length >= SEARCH_MAX_RESULTS) break;
      if (
        project.name.toLowerCase().includes(needle) ||
        project.slug.toLowerCase().includes(needle)
      ) {
        results.push({
          projectSlug: project.slug,
          projectName: project.name,
          matchType: "project",
        });
      }
      if (!args.includeKeys) continue;
      if (rowsRead >= SEARCH_ROW_BUDGET) {
        skippedProjects += 1;
        continue;
      }

      let variables: Awaited<ReturnType<typeof resolveEffectiveVariables>>;
      try {
        variables = await resolveEffectiveVariables(ctx, {
          projectId: project._id,
        });
      } catch {
        skippedProjects += 1;
        continue;
      }
      rowsRead += variables.length;
      for (const variable of variables) {
        if (results.length >= SEARCH_MAX_RESULTS) break;
        if (
          !environmentAllowedByScope(
            variable.environments,
            args.scopeEnvironments
          )
        )
          continue;
        if (variable.key.toLowerCase().includes(needle)) {
          results.push({
            projectSlug: project.slug,
            projectName: project.name,
            matchType: "variable",
            key: variable.key,
          });
        }
      }
    }

    return {
      results,
      truncated:
        projects.length > SEARCH_MAX_PROJECTS ||
        results.length >= SEARCH_MAX_RESULTS ||
        skippedProjects > 0,
      skippedProjects,
    };
  },
});

export const searchKeys = action({
  args: {
    token: v.string(),
    query: v.string(),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: searchResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "projects" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    return await ctx.runQuery(internal.features.api.reads._searchScoped, {
      organizationId: authorization.organizationId,
      scopeProjects: authorization.scopeProjects,
      scopeEnvironments: authorization.scopeEnvironments,
      includeKeys: authorization.scopeResources.includes("variables"),
      query: args.query,
    });
  },
});
