/**
 * MCP / public-API surface for project documentation.
 *
 * Three invariants:
 * 1. Reads are PUBLISHED ONLY — checked in the handler, since the slug index
 *    has no status component. Serving a draft would defeat the human gate.
 * 2. Writes only ever produce drafts. Publishing is a dashboard mutation.
 * 3. The `project_docs` gate is checked caller-side; `_authorizeRequest`
 *    derives its gate from the surface alone and cannot carry a third key.
 *
 * Docs name variable KEYS, never values — resolving one here would be a vault
 * read that skips every control in reads.ts.
 */
import { v, ConvexError } from "convex/values";
import {
  action,
  internalQuery,
  internalMutation,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { createAuditLog } from "../../lib/audit";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createBody } from "../docs/content";
import { readBody } from "../docs/content";
import { normalizePrUrl, scanDocBody, slugifyTitle } from "../docs/guards";
import { templateFor } from "../docs/templates";
import { uniqueSlug } from "../docs/helpers";
import {
  hashToken,
  assertKeyFormat,
  consumeRateLimit,
  throwForDenial,
  type Authorization,
} from "./helpers";

/** Hard ceiling on one search response — bounded scan, never a full table. */
const MAX_SEARCH_ROWS = 25;
/** How many metadata rows a single search may examine before ranking. */
const SEARCH_SCAN_LIMIT = 500;

const gateFeatureArg = v.optional(
  v.union(v.literal("public_api"), v.literal("mcp_server"))
);
const surfaceArg = v.optional(
  v.union(
    v.literal("github_action"),
    v.literal("rest_api"),
    v.literal("mcp_server")
  )
);

const docSummaryValidator = v.object({
  docId: v.id("docs"),
  title: v.string(),
  slug: v.string(),
  module: v.string(),
  type: v.union(v.literal("api"), v.literal("guide")),
  excerpt: v.optional(v.string()),
  updatedAt: v.number(),
});

/** Return types are explicit: inferring them is circular via `internal` and
 *  collapses to `any` (TS7022/7023). Same as reads.ts. */
type DocSummary = {
  docId: Id<"docs">;
  title: string;
  slug: string;
  module: string;
  type: "api" | "guide";
  excerpt?: string;
  updatedAt: number;
};

type DocDetail = {
  docId: Id<"docs">;
  title: string;
  slug: string;
  module: string;
  type: "api" | "guide";
  body: string;
  prUrl?: string;
  updatedAt: number;
  publishedAt?: number;
};

type CreatedDraft = {
  docId: Id<"docs">;
  slug: string;
  status: "draft";
  warnings: string[];
};

/** Search a project's PUBLISHED documentation. */
export const searchDocs = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    query: v.optional(v.string()),
    module: v.optional(v.string()),
    limit: v.optional(v.number()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args): Promise<DocSummary[]> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    // Two-step (as in reads.ts): the slug needs an organizationId, which only
    // a successful authorize returns. The second call enforces project scope.
    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      internal.features.projects.queries._getBySlug,
      { organizationId: bootstrap.organizationId, slug: args.projectSlug }
    );
    if (!projectDoc) throw new ConvexError("Project not found");

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs", projectId: projectDoc._id },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    // Out-of-scope must be indistinguishable from unknown.
    if (!scoped.ok) {
      if (scoped.denied === "project_scope") {
        throw new ConvexError("Project not found");
      }
      throwForDenial(scoped.denied);
    }

    return await ctx.runQuery(internal.features.api.docs._searchScopedDocs, {
      organizationId: bootstrap.organizationId,
      projectId: projectDoc._id,
      query: args.query,
      module: args.module,
      limit: args.limit,
    });
  },
});

export const _searchScopedDocs = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    projectId: v.id("projects"),
    query: v.optional(v.string()),
    module: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(docSummaryValidator),
  handler: async (ctx, args) => {
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "project_docs"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        gate.reason ?? "Project documentation requires a higher tier."
      );
    }

    // Closes the gap where another tenant's projectId is passed with a valid key.
    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      project.deletedAt !== undefined ||
      project.organizationId !== args.organizationId
    ) {
      throw new ConvexError("Project not found");
    }

    const limit = Math.min(
      Math.max(args.limit ?? MAX_SEARCH_ROWS, 1),
      MAX_SEARCH_ROWS
    );
    const term = args.query?.trim();
    const moduleFilter = args.module?.trim().toLowerCase();

    // Index-backed: agents loop, and a full scan here is the shape that bills.
    // `status` is a filterField on both indexes, so drafts are never read.
    const matched: Doc<"docs">[] = [];
    const seen = new Set<string>();
    const push = (doc: Doc<"docs"> | null) => {
      if (!doc || doc.deletedAt !== undefined) return;
      if (doc.status !== "published") return;
      if (moduleFilter && doc.module.toLowerCase() !== moduleFilter) return;
      if (seen.has(doc._id)) return;
      seen.add(doc._id);
      matched.push(doc);
    };

    if (term) {
      for (const doc of await ctx.db
        .query("docs")
        .withSearchIndex("search_title", (q) =>
          q
            .search("title", term)
            .eq("projectId", args.projectId)
            .eq("status", "published")
        )
        .take(limit)) {
        push(doc);
      }
      if (matched.length < limit) {
        for (const row of await ctx.db
          .query("docContent")
          .withSearchIndex("search_body", (q) =>
            q
              .search("body", term)
              .eq("projectId", args.projectId)
              .eq("status", "published")
          )
          .take(limit)) {
          push(await ctx.db.get(row.docId));
        }
      }
      // Neither index covers `module`, which the tool contract says `query`
      // matches — bounded metadata scan, only when the indexes underfill.
      if (matched.length < limit) {
        const needle = term.toLowerCase();
        for (const doc of await ctx.db
          .query("docs")
          .withIndex("by_project_and_status", (q) =>
            q.eq("projectId", args.projectId).eq("status", "published")
          )
          .filter((q) => q.eq(q.field("deletedAt"), undefined))
          .take(SEARCH_SCAN_LIMIT)) {
          if (doc.module.toLowerCase().includes(needle)) push(doc);
        }
      }
    } else {
      for (const doc of await ctx.db
        .query("docs")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", args.projectId).eq("status", "published")
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(SEARCH_SCAN_LIMIT)) {
        push(doc);
      }
      matched.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    return matched.slice(0, limit).map((doc) => ({
      docId: doc._id,
      title: doc.title,
      slug: doc.slug,
      module: doc.module,
      type: doc.type,
      excerpt: doc.excerpt,
      updatedAt: doc.updatedAt,
    }));
  },
});

/** Fetch ONE published page with its body. */
export const getDoc = action({
  args: {
    token: v.string(),
    docId: v.id("docs"),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: v.object({
    docId: v.id("docs"),
    title: v.string(),
    slug: v.string(),
    module: v.string(),
    type: v.union(v.literal("api"), v.literal("guide")),
    body: v.string(),
    prUrl: v.optional(v.string()),
    updatedAt: v.number(),
    publishedAt: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<DocDetail> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    // The doc's project is not known until the row is read, so authorize in
    // two steps exactly like the slug-addressed reads in reads.ts: establish
    // the key first, resolve the row, then re-authorize with its projectId —
    // which is what actually enforces project scope.
    const first: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!first.ok) throwForDenial(first.denied);

    const located: { projectId: Id<"projects">; doc: DocDetail } =
      await ctx.runQuery(internal.features.api.docs._locatePublishedDoc, {
        organizationId: first.organizationId,
        docId: args.docId,
      });

    const second: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs", projectId: located.projectId },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    // A project the key cannot see must be indistinguishable from a missing
    // one — never confirm a document's existence to a key out of scope.
    if (!second.ok) {
      if (second.denied === "project_scope") {
        throw new ConvexError("Document not found");
      }
      throwForDenial(second.denied);
    }

    return located.doc;
  },
});

export const _locatePublishedDoc = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    docId: v.id("docs"),
  },
  handler: async (ctx, args) => {
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "project_docs"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        gate.reason ?? "Project documentation requires a higher tier."
      );
    }

    const doc = await ctx.db.get(args.docId);
    // PUBLISHED ONLY. A draft is unreviewed text; handing one to an agent
    // would defeat the human publication gate. Deleted, draft, cross-org and
    // missing all collapse to the same answer.
    if (!doc || doc.deletedAt !== undefined || doc.status !== "published") {
      throw new ConvexError("Document not found");
    }
    const project = await ctx.db.get(doc.projectId);
    if (
      !project ||
      project.deletedAt !== undefined ||
      project.organizationId !== args.organizationId
    ) {
      throw new ConvexError("Document not found");
    }

    return {
      projectId: doc.projectId,
      doc: {
        docId: doc._id,
        title: doc.title,
        slug: doc.slug,
        module: doc.module,
        type: doc.type,
        body: await readBody(ctx, doc._id),
        prUrl: doc.prUrl,
        updatedAt: doc.updatedAt,
        publishedAt: doc.publishedAt,
      },
    };
  },
});

/**
 * Propose a documentation page. Creates a DRAFT — always.
 *
 * Modelled on `requests.createVariableRequest`: an agent proposes, a human
 * decides, and nothing is visible to anyone else until they do. The audit
 * entry is written here in the mutation rather than through
 * `_authorizeRequest`'s `recordUse`, whose `auditAction` is hard-coded to
 * `api.secrets_pulled` — auditing here keeps the doc actions honest and
 * changes no shared contract.
 */
export const createDoc = action({
  args: {
    token: v.string(),
    projectSlug: v.string(),
    module: v.string(),
    type: v.union(v.literal("api"), v.literal("guide")),
    title: v.string(),
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: v.object({
    docId: v.id("docs"),
    slug: v.string(),
    status: v.literal("draft"),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<CreatedDraft> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "docCreate", tokenHash);

    const bootstrap: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!bootstrap.ok) throwForDenial(bootstrap.denied);

    const projectDoc = await ctx.runQuery(
      internal.features.projects.queries._getBySlug,
      { organizationId: bootstrap.organizationId, slug: args.projectSlug }
    );
    if (!projectDoc) throw new ConvexError("Project not found");

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs", projectId: projectDoc._id },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!scoped.ok) {
      if (scoped.denied === "project_scope") {
        throw new ConvexError("Project not found");
      }
      throwForDenial(scoped.denied);
    }

    return await ctx.runMutation(internal.features.api.docs._createDocDraft, {
      organizationId: bootstrap.organizationId,
      keyId: bootstrap.keyId,
      projectId: projectDoc._id,
      module: args.module,
      type: args.type,
      title: args.title,
      body: args.body,
      prUrl: args.prUrl,
    });
  },
});

export const _createDocDraft = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    keyId: v.id("apiKeys"),
    projectId: v.id("projects"),
    module: v.string(),
    type: v.union(v.literal("api"), v.literal("guide")),
    title: v.string(),
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  returns: v.object({
    docId: v.id("docs"),
    slug: v.string(),
    status: v.literal("draft"),
    warnings: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const gate = await checkBooleanFeature(
      ctx.db,
      args.organizationId,
      "project_docs"
    );
    if (!gate.allowed) {
      throw new ConvexError(
        gate.reason ?? "Project documentation requires a higher tier."
      );
    }

    const project = await ctx.db.get(args.projectId);
    if (
      !project ||
      project.deletedAt !== undefined ||
      project.organizationId !== args.organizationId
    ) {
      throw new ConvexError("Project not found");
    }

    const title = args.title.trim();
    if (title.length === 0 || title.length > 200) {
      throw new ConvexError("Title must be 1-200 characters");
    }
    const moduleName = args.module.trim();
    if (moduleName.length === 0 || moduleName.length > 100) {
      throw new ConvexError("Module must be 1-100 characters");
    }

    const body = args.body ?? templateFor(args.type);
    // Blocks credential material and instructions aimed at the reader's tool
    // belt BEFORE anything is stored. Title and module are scanned too: both
    // are returned by search, so they reach an agent exactly like the body.
    scanDocBody(`${title}\n${moduleName}`);
    const { warnings } = scanDocBody(body);

    const slug = await uniqueSlug(ctx, args.projectId, slugifyTitle(title));
    const now = Date.now();

    // An API key has no user identity, so the key's creator owns the draft —
    // a real users row, which every downstream permission check needs.
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new ConvexError("Invalid key");

    const docId = await ctx.db.insert("docs", {
      projectId: args.projectId,
      module: moduleName,
      type: args.type,
      title,
      slug,
      // Always. Nothing on this surface can publish.
      status: "draft",
      authorId: key.createdBy,
      // Scheme-checked: this value is agent-supplied and is rendered as an
      // href in the reviewer's dashboard, so `javascript:` must never reach
      // the database.
      prUrl: normalizePrUrl(args.prUrl),
      createdAt: now,
      updatedAt: now,
    });

    const excerpt = await createBody(ctx, docId, args.projectId, body);
    await ctx.db.patch(docId, { excerpt });

    await createAuditLog(ctx, {
      organizationId: args.organizationId,
      projectId: args.projectId,
      userId: key.createdBy,
      action: "doc.created",
      // Metadata only — the body is already stored once in docContent, and
      // an audit row must not keep a second copy of it.
      details: {
        title,
        module: moduleName,
        slug,
        via: "api_key",
        keyId: args.keyId,
      },
    });

    return { docId, slug, status: "draft" as const, warnings };
  },
});
