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
import {
  oauthRateKey,
  requireMcpGate,
  requireOAuthUser,
  resolveOAuthOrganization,
  verifyOAuthToken,
} from "../../lib/mcpOAuth";
import { pool, VAULT_POOL_WIDTH } from "../../lib/pool";
import { isWorkspace } from "../../lib/projectKind";
import {
  applyDraftEdit,
  requireDocAccess,
  requireDocsFeature,
} from "../docs/helpers";
import { readBody } from "../docs/content";
import { listForUserCore } from "../projects/helpers";
import { listWithAccessCore } from "../variables/queries";
import { vaultReadWithRetry } from "../vault/vault";
import {
  createdDraftValidator,
  docPageValidator,
  docSummaryValidator,
  docViewArg,
  draftEditModeArg,
  findDocByClientRef,
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

const organizationArg = v.optional(v.string());

const projectSummaryValidator = v.object({
  name: v.string(),
  slug: v.string(),
  variableCount: v.number(),
});
type ProjectSummary = { name: string; slug: string; variableCount: number };

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

async function requireOrgProject(
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
): Promise<ReadableVariables["rows"]> {
  const { variables, truncatedAt } = await listWithAccessCore(ctx, {
    projectId,
    userId,
  });
  if (truncatedAt !== undefined) {
    throw new ConvexError(
      `Project has more than ${truncatedAt} active variables — refusing a partial pull. Contact support to raise the limit.`
    );
  }
  return variables.flatMap((variable) =>
    variable.hasAccess && variable.vaultRef !== undefined
      ? [
          {
            key: variable.key,
            environments: variable.environments,
            isSensitive: variable.isSensitive,
            updatedAt: variable.updatedAt,
            vaultRef: variable.vaultRef,
          },
        ]
      : []
  );
}

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
    return await Promise.all(
      projects.map(async (project) => {
        const active = await ctx.db
          .query("environmentVariables")
          .withIndex("by_project_deleted", (q) =>
            q.eq("projectId", project._id).eq("deletedAt", undefined)
          )
          .take(VARIABLE_COUNT_CAP);
        return {
          name: project.name,
          slug: project.slug,
          variableCount: active.length,
        };
      })
    );
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
  returns: v.array(variableValidator),
  handler: async (ctx, args): Promise<VariableRow[]> => {
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

    const keySet = args.keys ? new Set(args.keys) : null;
    const filtered = readable.rows.filter(
      (row) =>
        (!args.environment || row.environments.includes(args.environment)) &&
        (!keySet || keySet.has(row.key)) &&
        (!args.prefix || row.key.startsWith(args.prefix))
    );

    if (metadataOnly) {
      return filtered.map(({ vaultRef: _vaultRef, ...row }) => row);
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

    return values;
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
    return {
      organizationId: organization._id,
      projectId: project._id,
      userId: user._id,
      rows: await readableVariables(ctx, project._id, user._id),
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
      let rows: ReadableVariables["rows"];
      try {
        rows = await readableVariables(ctx, project._id, user._id);
      } catch {
        skippedProjects += 1;
        continue;
      }
      rowsRead += rows.length;
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
): Promise<{ doc: Doc<"docs">; project: Doc<"projects"> }> {
  const project = doc ? await ctx.db.get(doc.projectId) : null;
  if (!doc || doc.deletedAt !== undefined || !project) {
    throw new ConvexError("Document not found");
  }
  await requireMcpGate(ctx, project.organizationId);
  try {
    await requireDocAccess(ctx, userId, project._id);
  } catch {
    throw new ConvexError("Document not found");
  }
  await requireDocsFeature(ctx, project.organizationId);
  return { doc, project };
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
    if (doc.status !== "published") {
      throw new ConvexError("Document not found");
    }
    return {
      docId: doc._id,
      title: doc.title,
      slug: doc.slug,
      module: doc.module,
      type: doc.type,
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

    if (clientRef !== undefined) {
      const existing: CreatedDraft | null = await ctx.runQuery(
        internal.features.api.oauth._findDocByClientRef,
        { workosId: principal.workosId, clientRef }
      );
      if (existing) return existing;
    }

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

export const _findDocByClientRef = internalQuery({
  args: { workosId: v.string(), clientRef: v.string() },
  handler: async (ctx, args): Promise<CreatedDraft | null> => {
    const user = await requireOAuthUser(ctx, args.workosId);
    const doc = await findDocByClientRef(
      ctx,
      user._id,
      undefined,
      args.clientRef
    );
    const project = doc ? await ctx.db.get(doc.projectId) : null;
    if (!doc || !project) return null;
    return {
      docId: doc._id,
      slug: doc.slug,
      projectSlug: project.slug,
      status: doc.status,
      warnings: [],
    };
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
    const { doc, project } = await requireAgentVisibleProject(
      ctx,
      user._id,
      await ctx.db.get(args.docId)
    );
    if (doc.authorId !== user._id) {
      throw new ConvexError("Document not found");
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
