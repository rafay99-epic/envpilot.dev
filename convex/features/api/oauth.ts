import { v, ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { createAuditLog } from "../../lib/audit";
import { isSuspendedMembership } from "../../lib/authz";
import { VALID_ENVIRONMENTS } from "../../lib/environments";
import {
  oauthRateKey,
  requireMcpGate,
  requireOAuthUser,
  resolveOAuthOrganization,
  verifyOAuthToken,
} from "../../lib/mcpOAuth";
import {
  checkBooleanFeature,
  checkCountedLimit,
  checkNumericLimit,
  countActiveKeysForSurface,
  countActiveProjects,
} from "../featureRegistry/gates";
import {
  getOrgOwnerTier,
  resolveOrgGateContext,
} from "../featureRegistry/resolver";
import { pool, VAULT_POOL_WIDTH } from "../../lib/pool";
import { isWorkspace } from "../../lib/projectKind";
import {
  applyDraftEdit,
  canEditDoc,
  requireDocAccess,
  requireDocsFeature,
  type DocAccess,
} from "../docs/helpers";
import { readBody } from "../docs/content";
import { listForUserCore } from "../projects/helpers";
import { listWithAccessCore } from "../variables/queries";
import { resolveProjectAccessContext } from "../variables/helpers";
import { vaultReadWithRetry } from "../vault/vault";
import {
  createdDraftValidator,
  docPageValidator,
  docSummaryValidator,
  docViewArg,
  draftEditModeArg,
  insertAgentDraft,
  pageDoc,
  searchPublishedDocs,
  updatedDraftValidator,
  type CreatedDraft,
  type DocDetail,
  type DocPage,
  type DocSummary,
  type UpdatedDraft,
} from "./docs";
import { consumeRateLimit, normalizeClientRef } from "./helpers";

const SEARCH_MAX_PROJECTS = 20;
const SEARCH_MAX_RESULTS = 100;
const SEARCH_ROW_BUDGET = 8000;
const VARIABLE_COUNT_CAP = 500;
/**
 * Shared ceiling for the per-project counting in listProjects.
 *
 * Counting each project with its own take(500) had no total bound, so an
 * organization with 34 projects of 500 active variables read 17,000 documents
 * in one query and blew Convex's 16,384-document transaction limit. That threw
 * a non-ConvexError, so the FIRST tool an agent calls answered "Server Error"
 * with no hint. Matches SEARCH_ROW_BUDGET in spirit.
 */
const LIST_PROJECTS_ROW_BUDGET = 8000;

const organizationArg = v.optional(v.string());

const projectSummaryValidator = v.object({
  name: v.string(),
  slug: v.string(),
  /**
   * Absent when the organization is large enough that counting every project
   * would exceed the shared read budget. Absent means "not counted", never
   * zero: reporting zero would be a sentinel, and the whole point is that the
   * caller can tell the difference.
   */
  variableCount: v.optional(v.number()),
});
type ProjectSummary = { name: string; slug: string; variableCount?: number };

const variableValidator = v.object({
  key: v.string(),
  value: v.optional(v.string()),
  environments: v.array(v.string()),
  isSensitive: v.boolean(),
  updatedAt: v.number(),
});
type VariableRow = {
  key: string;
  value?: string;
  environments: string[];
  isSensitive: boolean;
  updatedAt: number;
};

type ReadableVariables = {
  organizationId: Id<"organizations">;
  projectId: Id<"projects">;
  userId: Id<"users">;
  rows: Array<Omit<VariableRow, "value"> & { vaultRef: string }>;
  /**
   * Keys the caller can SEE but not read, with the environments they cover.
   *
   * Without this a filtered-out variable is indistinguishable from one that
   * does not exist, so an agent writes a .env missing a key and the app fails
   * later for an unrelated-looking reason. Names only, never values.
   */
  inaccessible: Array<{ key: string; environments: string[] }>;
};

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

export async function requireOrgProject(
  ctx: QueryCtx,
  organizationId: Id<"organizations">,
  slug: string
): Promise<Doc<"projects">> {
  const project = await ctx.db
    .query("projects")
    .withIndex("by_org_slug_deleted", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("slug", slug)
        .eq("deletedAt", undefined)
    )
    .first();
  if (!project || isWorkspace(project)) {
    throw new ConvexError("Project not found");
  }
  return project;
}

async function visibleProjects(
  ctx: QueryCtx,
  userId: Id<"users">,
  organizationId: Id<"organizations">
): Promise<Doc<"projects">[]> {
  return (await listForUserCore(ctx, userId)).filter(
    (project) =>
      project.organizationId === organizationId && !isWorkspace(project)
  );
}

async function readableVariables(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  userId: Id<"users">
): Promise<Pick<ReadableVariables, "rows" | "inaccessible">> {
  const { variables, truncatedAt } = await listWithAccessCore(ctx, {
    projectId,
    userId,
  });
  if (truncatedAt !== undefined) {
    throw new ConvexError(
      `Project has more than ${truncatedAt} active variables — refusing a partial pull. Contact support to raise the limit.`
    );
  }
  const rows: ReadableVariables["rows"] = [];
  const inaccessible: ReadableVariables["inaccessible"] = [];
  for (const variable of variables) {
    if (variable.hasAccess && variable.vaultRef !== undefined) {
      rows.push({
        key: variable.key,
        environments: variable.environments,
        isSensitive: variable.isSensitive,
        updatedAt: variable.updatedAt,
        vaultRef: variable.vaultRef,
      });
      continue;
    }
    // The row-count truncation above is loud, but this filter was silent:
    // a variable the caller lacks a grant for was simply dropped, so a
    // short list looked exactly like a complete one.
    inaccessible.push({
      key: variable.key,
      environments: variable.environments,
    });
  }
  return { rows, inaccessible };
}

/**
 * What `envpilot_whoami` reports.
 *
 * Deliberately bounded. Org-level counts come from the existing bounded
 * counters; per-project counts (variables, files, accounts) would need a scan
 * per project, so they are left to `envpilot_list_projects` and the tool
 * description says so.
 */
/**
 * What `envpilot_whoami` reports.
 *
 * `organization` is NULLABLE on purpose. An account in several organizations
 * that names none of them still needs the list back, so discovery works
 * before anything is resolved; returning an error there would defeat the
 * whole point of the tool. In that case the per-organization fields come
 * back empty and the caller retries with a slug.
 *
 * Bounded deliberately. Org-level counts come from existing bounded
 * counters; per-project counts (variables, files, accounts) would need a
 * scan per project, so they stay in `envpilot_list_projects`.
 */
const whoamiOrganizationValidator = v.object({
  slug: v.string(),
  name: v.string(),
  plan: v.string(),
  enforcement: v.boolean(),
});

const whoamiValidator = v.object({
  user: v.object({
    name: v.optional(v.string()),
    email: v.string(),
  }),
  organizations: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      role: v.string(),
      isActive: v.boolean(),
    })
  ),
  organization: v.union(v.null(), whoamiOrganizationValidator),
  features: v.array(v.object({ key: v.string(), enabled: v.boolean() })),
  limits: v.array(
    v.object({
      key: v.string(),
      limit: v.union(v.number(), v.null()),
      used: v.optional(v.number()),
    })
  ),
  projects: v.array(
    v.object({
      slug: v.string(),
      name: v.string(),
      protectedEnvironments: v.array(v.string()),
    })
  ),
  environments: v.array(v.string()),
});

type WhoamiOrganization = {
  slug: string;
  name: string;
  plan: string;
  enforcement: boolean;
};

type Whoami = {
  user: { name?: string; email: string };
  organizations: Array<{
    slug: string;
    name: string;
    role: string;
    isActive: boolean;
  }>;
  organization: WhoamiOrganization | null;
  features: Array<{ key: string; enabled: boolean }>;
  limits: Array<{ key: string; limit: number | null; used?: number }>;
  projects: Array<{
    slug: string;
    name: string;
    protectedEnvironments: string[];
  }>;
  environments: string[];
};

/** Booleans an agent's behaviour actually depends on. */
const WHOAMI_FEATURES = [
  "mcp_server",
  "protected_environments",
  "public_api",
  "docker_image",
  "secret_files",
  "shared_accounts",
  "project_docs",
  "variable_version_history",
  "bulk_import",
] as const;

/**
 * Numeric limits worth reporting, with usage only where a bounded counter
 * already exists. The two key quotas are here because the free tier allows a
 * finite number of Docker and GitHub Action keys, so an agent asked to set up
 * CI needs to know before it tries.
 */
const WHOAMI_LIMITS = [
  "max_projects",
  "max_variables_per_project",
  "max_team_members",
  "secret_files_limit",
  "shared_accounts_limit",
  "max_docs_per_project",
  "docker_image_limit",
  "github_action_limit",
] as const;

export const whoami = action({
  args: { token: v.string(), organization: organizationArg },
  returns: whoamiValidator,
  handler: async (ctx, args): Promise<Whoami> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauth._whoami, {
      workosId: principal.workosId,
      organization: args.organization,
    });
  },
});

export const _whoami = internalQuery({
  args: { workosId: v.string(), organization: organizationArg },
  returns: whoamiValidator,
  handler: async (ctx, args): Promise<Whoami> => {
    const user = await requireOAuthUser(ctx, args.workosId);

    // Memberships FIRST, before resolving an active organization. The shared
    // resolver throws on ambiguous membership, which would make this tool
    // unable to answer the very question a multi-organization caller has.
    const memberships = (
      await ctx.db
        .query("organizationMembers")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect()
    ).filter((m) => !isSuspendedMembership(m));
    const orgDocs = (
      await Promise.all(
        memberships.map(async (m) => ({
          membership: m,
          org: await ctx.db.get(m.organizationId),
        }))
      )
    ).flatMap((row) => (row.org ? [{ ...row, org: row.org }] : []));

    const active =
      args.organization !== undefined
        ? orgDocs.find((row) => row.org.slug === args.organization)
        : orgDocs.length === 1
          ? orgDocs[0]
          : undefined;

    if (args.organization !== undefined && !active) {
      throw new ConvexError("Organization not found");
    }
    if (orgDocs.length === 0) {
      throw new ConvexError("This account is not a member of any organization");
    }

    const organizations = orgDocs.map((row) => ({
      slug: row.org.slug,
      name: row.org.name,
      role: row.membership.role,
      isActive: active !== undefined && row.org._id === active.org._id,
    }));

    const base = {
      user: { name: user.name, email: user.email },
      organizations,
      environments: [...VALID_ENVIRONMENTS],
    };

    // Ambiguous: hand back the list so the caller can pick, rather than an
    // error it has to parse.
    if (!active) {
      return {
        ...base,
        organization: null,
        features: [],
        limits: [],
        projects: [],
      };
    }

    const organization = active.org;
    await requireMcpGate(ctx, organization._id);

    // One shared context for every gate check below, instead of re-resolving
    // the org, the owner's tier and the grace period per feature key.
    const gateContext = await resolveOrgGateContext(ctx.db, organization._id);

    const features = await Promise.all(
      WHOAMI_FEATURES.map(async (key) => ({
        key,
        enabled: (
          await checkBooleanFeature(ctx.db, organization._id, key, gateContext)
        ).allowed,
      }))
    );

    // checkCountedLimit, not checkNumericLimit: the count runs ONLY when the
    // tier actually resolves to a number. whoami is the first call an agent
    // makes, so an eager scan here would put a full active-projects count on
    // the hottest metadata path for every Pro org and every deployment with
    // enforcement off, to decide a limit that can never bind.
    const now = Date.now();
    const counters: Partial<
      Record<(typeof WHOAMI_LIMITS)[number], () => Promise<number>>
    > = {
      max_projects: () => countActiveProjects(ctx.db, organization._id),
      // Named in the description as the thing an agent checks before trying
      // to mint a key, so the usage has to actually be there.
      docker_image_limit: () =>
        countActiveKeysForSurface(ctx.db, organization._id, "docker", now),
      github_action_limit: () =>
        countActiveKeysForSurface(
          ctx.db,
          organization._id,
          "github_action",
          now
        ),
    };

    const limits = await Promise.all(
      WHOAMI_LIMITS.map(async (key) => {
        const counter = counters[key];
        if (!counter) {
          const resolved = await checkNumericLimit(
            ctx.db,
            organization._id,
            key,
            0,
            gateContext
          );
          return { key, limit: resolved.limit };
        }
        let used: number | undefined;
        const resolved = await checkCountedLimit(
          ctx.db,
          organization._id,
          key,
          async (limit) => {
            used = await counter();
            return used;
          },
          gateContext,
          // Report usage as it stands rather than asking "could I add one".
          0
        );
        return { key, limit: resolved.limit, used };
      })
    );

    const projects = (
      await visibleProjects(ctx, user._id, organization._id)
    ).map((project) => ({
      slug: project.slug,
      name: project.name,
      // The agent-relevant bit: a write touching one of these becomes a
      // change request a person approves, rather than applying.
      protectedEnvironments: project.protection?.environments ?? [],
    }));

    // The real plan, not a gate's tierName: when enforcement is off every
    // gate resolves as "unlimited", which would have misreported a free org.
    const { tierName } = await getOrgOwnerTier(
      ctx.db,
      organization._id,
      organization
    );

    return {
      ...base,
      organization: {
        slug: organization.slug,
        name: organization.name,
        plan: tierName,
        enforcement: gateContext.enforced,
      },
      features,
      limits,
      projects,
    };
  },
});

export const listProjects = action({
  args: { token: v.string(), organization: organizationArg },
  returns: v.array(projectSummaryValidator),
  handler: async (ctx, args): Promise<ProjectSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauth._listProjects, {
      workosId: principal.workosId,
      organization: args.organization,
    });
  },
});

export const _listProjects = internalQuery({
  args: { workosId: v.string(), organization: organizationArg },
  returns: v.array(projectSummaryValidator),
  handler: async (ctx, args): Promise<ProjectSummary[]> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const projects = await visibleProjects(ctx, user._id, organization._id);
    // Sequential on purpose: the budget has to be spent in order so the
    // projects that do get counted are counted correctly, rather than every
    // project racing to read its own 500.
    let budget = LIST_PROJECTS_ROW_BUDGET;
    const summaries: ProjectSummary[] = [];
    for (const project of projects) {
      if (budget <= 0) {
        summaries.push({ name: project.name, slug: project.slug });
        continue;
      }
      const limit = Math.min(VARIABLE_COUNT_CAP, budget);
      const active = await ctx.db
        .query("environmentVariables")
        .withIndex("by_project_deleted", (q) =>
          q.eq("projectId", project._id).eq("deletedAt", undefined)
        )
        .take(limit);
      budget -= active.length;
      // A read stopped by the REMAINING BUDGET rather than by the cap tells
      // us nothing about the real total, so the count is omitted rather than
      // reported as if exact. Hitting the cap is the documented bound.
      const budgetLimited =
        limit < VARIABLE_COUNT_CAP && active.length === limit;
      summaries.push({
        name: project.name,
        slug: project.slug,
        ...(budgetLimited ? {} : { variableCount: active.length }),
      });
    }
    return summaries;
  },
});

export const getVariables = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    environment: v.optional(v.string()),
    keys: v.optional(v.array(v.string())),
    prefix: v.optional(v.string()),
    metadataOnly: v.optional(v.boolean()),
  },
  returns: v.object({
    variables: v.array(variableValidator),
    inaccessibleKeys: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ variables: VariableRow[]; inaccessibleKeys: string[] }> => {
    const principal = await verifyOAuthToken(args.token);
    const metadataOnly = args.metadataOnly ?? false;
    if (!metadataOnly && !args.environment) {
      throw new ConvexError(
        "Missing required param: environment (or pass metadata_only=true)"
      );
    }
    await consumeRateLimit(
      ctx,
      metadataOnly ? "apiMetadata" : "cicdPull",
      oauthRateKey(principal)
    );

    const readable: ReadableVariables = await ctx.runQuery(
      internal.features.api.oauth._readVariables,
      {
        workosId: principal.workosId,
        organization: args.organization,
        projectSlug: args.projectSlug,
      }
    );

    // An EMPTY array means no filter, not "match nothing". A truthy [] built
    // an empty Set and returned zero variables, the same bug the REST route
    // had with `?keys=,,,`.
    const keySet = args.keys?.length ? new Set(args.keys) : null;
    const matches = (row: { key: string; environments: string[] }): boolean =>
      (!args.environment || row.environments.includes(args.environment)) &&
      (!keySet || keySet.has(row.key)) &&
      (!args.prefix || row.key.startsWith(args.prefix));

    const filtered = readable.rows.filter(matches);
    // Narrowed by the same filters, so the caller is told about the keys it
    // actually asked for rather than everything in the project.
    // Deduplicated: the same key may exist on two active variables with
    // disjoint environments, so without an environment filter both rows
    // match and the name would appear twice.
    const inaccessibleKeys = [
      ...new Set(readable.inaccessible.filter(matches).map((row) => row.key)),
    ];

    if (metadataOnly) {
      return {
        variables: filtered.map(({ vaultRef: _vaultRef, ...row }) => row),
        inaccessibleKeys,
      };
    }

    const values = await pool(
      filtered,
      VAULT_POOL_WIDTH,
      async ({ vaultRef, ...row }) => {
        try {
          return { ...row, value: await vaultReadWithRetry(vaultRef) };
        } catch {
          throw new ConvexError(
            `Failed to decrypt "${row.key}" — pull aborted (transient vault errors are retryable; persistent ones need the variable re-saved)`
          );
        }
      }
    );

    await ctx.runMutation(internal.features.api.oauth._recordPull, {
      organizationId: readable.organizationId,
      projectId: readable.projectId,
      userId: readable.userId,
      details: {
        via: "oauth",
        clientId: principal.clientId,
        projectSlug: args.projectSlug,
        environment: args.environment,
        keys: args.keys,
        prefix: args.prefix,
      },
    });

    return { variables: values, inaccessibleKeys };
  },
});

export const _readVariables = internalQuery({
  args: {
    workosId: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
  },
  handler: async (ctx, args): Promise<ReadableVariables> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const project = await requireOrgProject(
      ctx,
      organization._id,
      args.projectSlug
    );
    const { rows, inaccessible } = await readableVariables(
      ctx,
      project._id,
      user._id
    );
    // An empty read may mean the project is not the user's at all: not
    // assigned and no variable grants. That reads as missing, before any
    // pull is recorded against it. Only empty reads pay for the check.
    if (!rows.length) {
      const resolved = await resolveProjectAccessContext(
        ctx,
        project._id,
        user._id
      );
      if (
        !resolved ||
        (!resolved.access.isOwner && !resolved.access.assigned)
      ) {
        throw new ConvexError("Project not found");
      }
    }
    return {
      organizationId: organization._id,
      projectId: project._id,
      userId: user._id,
      rows,
      inaccessible,
    };
  },
});

export const _recordPull = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    userId: v.id("users"),
    details: v.object({
      via: v.literal("oauth"),
      clientId: v.optional(v.string()),
      projectSlug: v.string(),
      environment: v.optional(v.string()),
      keys: v.optional(v.array(v.string())),
      prefix: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      projectId: args.projectId,
      userId: args.userId,
      action: "api.secrets_pulled",
      details: args.details,
    });
  },
});

export const search = action({
  args: { token: v.string(), organization: organizationArg, query: v.string() },
  returns: searchResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauth._search, {
      workosId: principal.workosId,
      organization: args.organization,
      query: args.query,
    });
  },
});

export const _search = internalQuery({
  args: {
    workosId: v.string(),
    organization: organizationArg,
    query: v.string(),
  },
  returns: searchResultValidator,
  handler: async (ctx, args): Promise<SearchResult> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const projects = await visibleProjects(ctx, user._id, organization._id);
    const needle = args.query.toLowerCase();
    const results: SearchResult["results"] = [];
    let skippedProjects = 0;
    let rowsRead = 0;

    for (const project of projects.slice(0, SEARCH_MAX_PROJECTS)) {
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
      if (rowsRead >= SEARCH_ROW_BUDGET) {
        skippedProjects += 1;
        continue;
      }
      let listed: Awaited<ReturnType<typeof listWithAccessCore>>;
      try {
        listed = await listWithAccessCore(ctx, {
          projectId: project._id,
          userId: user._id,
          limit: SEARCH_ROW_BUDGET - rowsRead,
          readBudget: SEARCH_ROW_BUDGET - rowsRead,
        });
      } catch {
        skippedProjects += 1;
        continue;
      }
      rowsRead += listed.rowsRead;
      if (listed.truncatedAt !== undefined) skippedProjects += 1;
      const rows = listed.variables.filter((row) => row.hasAccess);
      for (const row of rows) {
        if (results.length >= SEARCH_MAX_RESULTS) break;
        if (row.key.toLowerCase().includes(needle)) {
          results.push({
            projectSlug: project.slug,
            projectName: project.name,
            matchType: "variable",
            key: row.key,
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

export const searchDocs = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    query: v.optional(v.string()),
    module: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args): Promise<DocSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauth._searchDocs, {
      workosId: principal.workosId,
      organization: args.organization,
      projectSlug: args.projectSlug,
      query: args.query,
      module: args.module,
      limit: args.limit,
    });
  },
});

export const _searchDocs = internalQuery({
  args: {
    workosId: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    query: v.optional(v.string()),
    module: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args): Promise<DocSummary[]> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const project = await requireOrgProject(
      ctx,
      organization._id,
      args.projectSlug
    );
    await requireDocAccess(ctx, user._id, project._id);
    return await searchPublishedDocs(ctx, {
      organizationId: organization._id,
      projectId: project._id,
      query: args.query,
      module: args.module,
      limit: args.limit,
    });
  },
});

const DRAFT_SCAN_LIMIT = 1000;
const DRAFT_LIST_LIMIT = 100;

export const listDocDrafts = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args): Promise<DocSummary[]> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    return await ctx.runQuery(internal.features.api.oauth._listDocDrafts, {
      workosId: principal.workosId,
      organization: args.organization,
      projectSlug: args.projectSlug,
    });
  },
});

/** The caller's own unpublished drafts in a project, newest first. */
export const _listDocDrafts = internalQuery({
  args: {
    workosId: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args): Promise<DocSummary[]> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const project = await requireOrgProject(
      ctx,
      organization._id,
      args.projectSlug
    );
    await requireDocAccess(ctx, user._id, project._id);
    await requireDocsFeature(ctx, organization._id);
    const drafts = await ctx.db
      .query("docs")
      .withIndex("by_project_author_status", (q) =>
        q
          .eq("projectId", project._id)
          .eq("authorId", user._id)
          .eq("status", "draft")
      )
      .take(DRAFT_SCAN_LIMIT);
    return drafts
      .filter((doc) => doc.deletedAt === undefined)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, DRAFT_LIST_LIMIT)
      .map((doc) => ({
        docId: doc._id,
        title: doc.title,
        slug: doc.slug,
        module: doc.module,
        type: doc.type,
        updatedAt: doc.updatedAt,
      }));
  },
});

export const getDoc = action({
  args: {
    token: v.string(),
    docId: v.id("docs"),
    view: docViewArg,
    section: v.optional(v.string()),
    cursor: v.optional(v.string()),
  },
  returns: docPageValidator,
  handler: async (ctx, args): Promise<DocPage> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", oauthRateKey(principal));
    const doc: DocDetail = await ctx.runQuery(
      internal.features.api.oauth._getDoc,
      { workosId: principal.workosId, docId: args.docId }
    );
    return pageDoc(doc, args);
  },
});

async function requireAgentVisibleProject(
  ctx: QueryCtx,
  userId: Id<"users">,
  doc: Doc<"docs"> | null
): Promise<{ doc: Doc<"docs">; project: Doc<"projects">; access: DocAccess }> {
  const project = doc ? await ctx.db.get(doc.projectId) : null;
  if (!doc || doc.deletedAt !== undefined || !project) {
    throw new ConvexError("Document not found");
  }
  await requireMcpGate(ctx, project.organizationId);
  let access: DocAccess;
  try {
    access = await requireDocAccess(ctx, userId, project._id);
  } catch {
    throw new ConvexError("Document not found");
  }
  await requireDocsFeature(ctx, project.organizationId);
  return { doc, project, access };
}

export const _getDoc = internalQuery({
  args: { workosId: v.string(), docId: v.id("docs") },
  handler: async (ctx, args): Promise<DocDetail> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const { doc } = await requireAgentVisibleProject(
      ctx,
      user._id,
      await ctx.db.get(args.docId)
    );
    // A draft reaches only the person who wrote it (through any client they
    // signed in), so an agent can read back what it wrote. Everyone else sees
    // published pages only.
    if (doc.status !== "published" && doc.authorId !== user._id) {
      throw new ConvexError("Document not found");
    }
    return {
      docId: doc._id,
      title: doc.title,
      slug: doc.slug,
      module: doc.module,
      type: doc.type,
      status: doc.status,
      body: await readBody(ctx, doc._id),
      prUrl: doc.prUrl,
      updatedAt: doc.updatedAt,
      publishedAt: doc.publishedAt,
    };
  },
});

export const createDoc = action({
  args: {
    token: v.string(),
    organization: organizationArg,
    projectSlug: v.string(),
    module: v.string(),
    type: v.union(v.literal("api"), v.literal("guide")),
    title: v.string(),
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    clientRef: v.optional(v.string()),
  },
  returns: createdDraftValidator,
  handler: async (ctx, args): Promise<CreatedDraft> => {
    const principal = await verifyOAuthToken(args.token);
    const clientRef = normalizeClientRef(args.clientRef);
    await consumeRateLimit(ctx, "docCreate", oauthRateKey(principal));
    return await ctx.runMutation(internal.features.api.oauth._createDoc, {
      workosId: principal.workosId,
      clientId: principal.clientId,
      organization: args.organization,
      projectSlug: args.projectSlug,
      module: args.module,
      type: args.type,
      title: args.title,
      body: args.body,
      prUrl: args.prUrl,
      clientRef,
    });
  },
});

export const _createDoc = internalMutation({
  args: {
    workosId: v.string(),
    clientId: v.optional(v.string()),
    organization: organizationArg,
    projectSlug: v.string(),
    module: v.string(),
    type: v.union(v.literal("api"), v.literal("guide")),
    title: v.string(),
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    clientRef: v.optional(v.string()),
  },
  returns: createdDraftValidator,
  handler: async (ctx, args): Promise<CreatedDraft> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const organization = await resolveOAuthOrganization(
      ctx,
      user._id,
      args.organization
    );
    const project = await requireOrgProject(
      ctx,
      organization._id,
      args.projectSlug
    );
    const access = await requireDocAccess(ctx, user._id, project._id);
    await requireDocsFeature(ctx, organization._id);
    if (!access.canCreate) {
      throw new ConvexError(
        "Your role cannot create documentation pages in this project"
      );
    }
    return await insertAgentDraft(ctx, {
      project,
      authorId: user._id,
      module: args.module,
      type: args.type,
      title: args.title,
      body: args.body,
      prUrl: args.prUrl,
      clientRef: args.clientRef,
      auditDetails: { via: "oauth", clientId: args.clientId },
    });
  },
});

export const updateDocDraft = action({
  args: {
    token: v.string(),
    docId: v.id("docs"),
    mode: draftEditModeArg,
    body: v.string(),
    section: v.optional(v.string()),
  },
  returns: updatedDraftValidator,
  handler: async (ctx, args): Promise<UpdatedDraft> => {
    const principal = await verifyOAuthToken(args.token);
    await consumeRateLimit(ctx, "docUpdate", oauthRateKey(principal));
    return await ctx.runMutation(internal.features.api.oauth._updateDocDraft, {
      workosId: principal.workosId,
      clientId: principal.clientId,
      docId: args.docId,
      mode: args.mode,
      body: args.body,
      section: args.section,
    });
  },
});

export const _updateDocDraft = internalMutation({
  args: {
    workosId: v.string(),
    clientId: v.optional(v.string()),
    docId: v.id("docs"),
    mode: draftEditModeArg,
    body: v.string(),
    section: v.optional(v.string()),
  },
  returns: updatedDraftValidator,
  handler: async (ctx, args): Promise<UpdatedDraft> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const { doc, project, access } = await requireAgentVisibleProject(
      ctx,
      user._id,
      await ctx.db.get(args.docId)
    );
    if (doc.authorId !== user._id) {
      throw new ConvexError("Document not found");
    }
    if (!canEditDoc(doc, user._id, access)) {
      throw new ConvexError("Your role cannot edit this documentation page");
    }
    const { bytes, warnings } = await applyDraftEdit(
      ctx,
      doc,
      { mode: args.mode, body: args.body, section: args.section },
      {
        organizationId: project.organizationId,
        userId: user._id,
        details: { via: "oauth", clientId: args.clientId },
      }
    );
    return {
      docId: doc._id,
      slug: doc.slug,
      projectSlug: project.slug,
      status: "draft",
      bytes,
      warnings,
    };
  },
});
