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
  type MutationCtx,
  type QueryCtx,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { createAuditLog } from "../../lib/audit";
import { checkBooleanFeature } from "../featureRegistry/gates";
import { createBody } from "../docs/content";
import { readBody } from "../docs/content";
import { normalizePrUrl, scanDocBody, slugifyTitle } from "../docs/guards";
import { templateFor } from "../docs/templates";
import {
  applyDraftEdit,
  requireDocCapacity,
  uniqueSlug,
} from "../docs/helpers";
import {
  hashToken,
  assertKeyFormat,
  consumeRateLimit,
  normalizeClientRef,
  throwForDenial,
  type Authorization,
} from "./helpers";
import {
  findSection,
  pageOf,
  parseCursor,
  parseSections,
} from "../docs/sections";

/** Hard ceiling on one search response — bounded scan, never a full table. */
const MAX_SEARCH_ROWS = 25;
/** How many metadata rows a single search may examine before ranking. */
const SEARCH_SCAN_LIMIT = 500;

/**
 * Whole-word module matching, to sit alongside the full-text indexes rather
 * than contradict them. A plain `includes` made "wall" match "Firewall" and
 * handed agents documents the search contract never promised.
 */
function moduleMatchesTerm(moduleName: string, term: string): boolean {
  const tokens = moduleName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const needles = term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (needles.length === 0) return false;
  // Every term must match a whole token, except the last, which may be a
  // prefix — the same rule the Convex search indexes apply.
  return needles.every((needle, i) =>
    i === needles.length - 1
      ? tokens.some((token) => token.startsWith(needle))
      : tokens.includes(needle)
  );
}

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

export const docSummaryValidator = v.object({
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
export type DocSummary = {
  docId: Id<"docs">;
  title: string;
  slug: string;
  module: string;
  type: "api" | "guide";
  excerpt?: string;
  updatedAt: number;
};

export type DocDetail = {
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

export type CreatedDraft = {
  docId: Id<"docs">;
  slug: string;
  projectSlug: string;
  status: "draft" | "published";
  warnings: string[];
};

export const createdDraftValidator = v.object({
  docId: v.id("docs"),
  slug: v.string(),
  projectSlug: v.string(),
  status: v.union(v.literal("draft"), v.literal("published")),
  warnings: v.array(v.string()),
});

export type DocPage = Omit<DocDetail, "body"> & {
  body: string;
  totalChars: number;
  nextCursor?: string;
  sections?: Array<{ id: string; title: string; level: number; chars: number }>;
};

export type UpdatedDraft = {
  docId: Id<"docs">;
  slug: string;
  projectSlug: string;
  status: "draft";
  bytes: number;
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

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);
    if (!scoped.project) throw new ConvexError("Project not found");

    return await ctx.runQuery(internal.features.api.docs._searchScopedDocs, {
      organizationId: scoped.organizationId,
      projectId: scoped.project._id,
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
  handler: async (ctx, args) => searchPublishedDocs(ctx, args),
});

export async function searchPublishedDocs(
  ctx: QueryCtx,
  args: {
    organizationId: Id<"organizations">;
    projectId: Id<"projects">;
    query?: string;
    module?: string;
    limit?: number;
  }
): Promise<DocSummary[]> {
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
        if (moduleMatchesTerm(doc.module, needle)) push(doc);
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
}

export const docPageValidator = v.object({
  docId: v.id("docs"),
  title: v.string(),
  slug: v.string(),
  module: v.string(),
  type: v.union(v.literal("api"), v.literal("guide")),
  body: v.string(),
  totalChars: v.number(),
  nextCursor: v.optional(v.string()),
  sections: v.optional(
    v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        level: v.number(),
        chars: v.number(),
      })
    )
  ),
  prUrl: v.optional(v.string()),
  updatedAt: v.number(),
  publishedAt: v.optional(v.number()),
});

export const docViewArg = v.optional(
  v.union(v.literal("outline"), v.literal("content"))
);

/** Fetch ONE published page, its outline, or one page of its body. */
export const getDoc = action({
  args: {
    token: v.string(),
    docId: v.id("docs"),
    view: docViewArg,
    section: v.optional(v.string()),
    cursor: v.optional(v.string()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: docPageValidator,
  handler: async (ctx, args): Promise<DocPage> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "apiMetadata", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    const located: LocatedDoc = await ctx.runQuery(
      internal.features.api.docs._locatePublishedDoc,
      {
        organizationId: authorization.organizationId,
        scopeProjects: authorization.scopeProjects,
        docId: args.docId,
      }
    );

    // A project the key cannot see must be indistinguishable from a missing
    // one — never confirm a document's existence to a key out of scope.
    if (!located.inScope) {
      await ctx.runMutation(internal.features.api.authorize._authorizeRequest, {
        tokenHash,
        requirement: { resource: "docs", projectId: located.projectId },
        gateFeature: args.gateFeature,
        surface: args.surface,
      });
      throw new ConvexError("Document not found");
    }

    return pageDoc(located.doc, args);
  },
});

type LocatedDoc =
  | { inScope: false; projectId: Id<"projects"> }
  | { inScope: true; projectId: Id<"projects">; doc: DocDetail };

export function pageDoc(
  doc: DocDetail,
  args: { view?: "outline" | "content"; section?: string; cursor?: string }
): DocPage {
  const { body, ...meta } = doc;
  const sections = parseSections(body);
  const outline = sections.map((s) => ({
    id: s.id,
    title: s.title,
    level: s.level,
    chars: s.end - s.start,
  }));

  if (args.view === "outline") {
    return { ...meta, body: "", totalChars: body.length, sections: outline };
  }

  const text =
    args.section === undefined
      ? body
      : (() => {
          const section = findSection(body, args.section);
          return body.slice(section.start, section.end);
        })();
  const { chunk, nextOffset } = pageOf(
    text,
    parseCursor(args.cursor, text.length)
  );
  const firstPageOfLongDoc =
    args.cursor === undefined &&
    args.section === undefined &&
    nextOffset !== undefined;
  return {
    ...meta,
    body: chunk,
    totalChars: text.length,
    nextCursor: nextOffset === undefined ? undefined : String(nextOffset),
    sections: firstPageOfLongDoc ? outline : undefined,
  };
}

export const _locatePublishedDoc = internalQuery({
  args: {
    organizationId: v.id("organizations"),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    docId: v.id("docs"),
  },
  handler: async (ctx, args): Promise<LocatedDoc> => {
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
    if (
      args.scopeProjects !== "all" &&
      !args.scopeProjects.includes(doc.projectId)
    ) {
      return { inScope: false, projectId: doc.projectId };
    }

    return {
      inScope: true,
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

async function findDocByClientRef(
  ctx: QueryCtx,
  projectId: Id<"projects">,
  authorId: Id<"users">,
  keyId: Id<"apiKeys"> | undefined,
  clientRef: string
): Promise<Doc<"docs"> | null> {
  const rows = await ctx.db
    .query("docs")
    .withIndex("by_author_and_client_ref", (q) =>
      q.eq("authorId", authorId).eq("clientRef", clientRef)
    )
    .take(20);
  return (
    rows.find(
      (row) =>
        row.projectId === projectId &&
        row.createdByKeyId === keyId &&
        row.deletedAt === undefined
    ) ?? null
  );
}

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
    clientRef: v.optional(v.string()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: createdDraftValidator,
  handler: async (ctx, args): Promise<CreatedDraft> => {
    assertKeyFormat(args.token);
    const clientRef = normalizeClientRef(args.clientRef);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "docCreate", tokenHash);

    const scoped: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        projectSlug: args.projectSlug,
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!scoped.ok) throwForDenial(scoped.denied);
    if (!scoped.project) throw new ConvexError("Project not found");

    return await ctx.runMutation(internal.features.api.docs._createDocDraft, {
      organizationId: scoped.organizationId,
      keyId: scoped.keyId,
      projectId: scoped.project._id,
      module: args.module,
      type: args.type,
      title: args.title,
      body: args.body,
      prUrl: args.prUrl,
      clientRef,
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
    clientRef: v.optional(v.string()),
  },
  returns: createdDraftValidator,
  handler: async (ctx, args): Promise<CreatedDraft> => {
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

    // An API key has no user identity, so the key's creator owns the draft —
    // a real users row, which every downstream permission check needs.
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new ConvexError("Invalid key");

    return await insertAgentDraft(ctx, {
      project,
      authorId: key.createdBy,
      keyId: key._id,
      module: args.module,
      type: args.type,
      title: args.title,
      body: args.body,
      prUrl: args.prUrl,
      clientRef: args.clientRef,
      auditDetails: { via: "api_key", keyId: args.keyId },
    });
  },
});

export async function insertAgentDraft(
  ctx: MutationCtx,
  args: {
    project: Doc<"projects">;
    authorId: Id<"users">;
    keyId?: Id<"apiKeys">;
    module: string;
    type: "api" | "guide";
    title: string;
    body?: string;
    prUrl?: string;
    clientRef?: string;
    auditDetails: Record<string, unknown>;
  }
): Promise<CreatedDraft> {
  const { project } = args;

  if (args.clientRef !== undefined) {
    const existing = await findDocByClientRef(
      ctx,
      project._id,
      args.authorId,
      args.keyId,
      args.clientRef
    );
    if (existing) {
      return {
        docId: existing._id,
        slug: existing.slug,
        projectSlug: project.slug,
        status: existing.status,
        warnings: [],
      };
    }
  }

  // Same ceilings as the dashboard. An agent must not be able to walk
  // around a tier limit just because it came in through the MCP surface.
  await requireDocCapacity(ctx, project, project._id);

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
  const meta = scanDocBody(`${title}\n${moduleName}`);
  const bodyScan = scanDocBody(body);
  // Both sets reach the reviewer — a warning about the title is exactly as
  // worth seeing as one about the body, and discarding it hid half of them.
  const warnings = [...meta.warnings, ...bodyScan.warnings];

  const slug = await uniqueSlug(ctx, project._id, slugifyTitle(title));
  const now = Date.now();

  const docId = await ctx.db.insert("docs", {
    projectId: project._id,
    module: moduleName,
    type: args.type,
    title,
    slug,
    // Always. Nothing on this surface can publish.
    status: "draft",
    authorId: args.authorId,
    // Scheme-checked: this value is agent-supplied and is rendered as an
    // href in the reviewer's dashboard, so `javascript:` must never reach
    // the database.
    prUrl: normalizePrUrl(args.prUrl),
    createdByKeyId: args.keyId,
    clientRef: args.clientRef,
    createdAt: now,
    updatedAt: now,
  });

  const excerpt = await createBody(ctx, docId, project._id, body);
  await ctx.db.patch(docId, { excerpt });

  await createAuditLog(ctx, {
    organizationId: project.organizationId,
    projectId: project._id,
    userId: args.authorId,
    action: "doc.created",
    // Metadata only — the body is already stored once in docContent, and
    // an audit row must not keep a second copy of it.
    details: { title, module: moduleName, slug, ...args.auditDetails },
  });

  return {
    docId,
    slug,
    projectSlug: project.slug,
    status: "draft",
    warnings,
  };
}

export const updatedDraftValidator = v.object({
  docId: v.id("docs"),
  slug: v.string(),
  projectSlug: v.string(),
  status: v.literal("draft"),
  bytes: v.number(),
  warnings: v.array(v.string()),
});

export const draftEditModeArg = v.union(
  v.literal("replace"),
  v.literal("append"),
  v.literal("replace_section")
);

export const updateDocDraft = action({
  args: {
    token: v.string(),
    docId: v.id("docs"),
    mode: draftEditModeArg,
    body: v.string(),
    section: v.optional(v.string()),
    gateFeature: gateFeatureArg,
    surface: surfaceArg,
  },
  returns: updatedDraftValidator,
  handler: async (ctx, args): Promise<UpdatedDraft> => {
    assertKeyFormat(args.token);
    const tokenHash = await hashToken(args.token);
    await consumeRateLimit(ctx, "docUpdate", tokenHash);

    const authorization: Authorization = await ctx.runMutation(
      internal.features.api.authorize._authorizeRequest,
      {
        tokenHash,
        requirement: { resource: "docs" },
        gateFeature: args.gateFeature,
        surface: args.surface,
      }
    );
    if (!authorization.ok) throwForDenial(authorization.denied);

    return await ctx.runMutation(internal.features.api.docs._updateDocDraft, {
      organizationId: authorization.organizationId,
      scopeProjects: authorization.scopeProjects,
      keyId: authorization.keyId,
      docId: args.docId,
      mode: args.mode,
      body: args.body,
      section: args.section,
    });
  },
});

export const _updateDocDraft = internalMutation({
  args: {
    organizationId: v.id("organizations"),
    scopeProjects: v.union(v.literal("all"), v.array(v.id("projects"))),
    keyId: v.id("apiKeys"),
    docId: v.id("docs"),
    mode: draftEditModeArg,
    body: v.string(),
    section: v.optional(v.string()),
  },
  returns: updatedDraftValidator,
  handler: async (ctx, args): Promise<UpdatedDraft> => {
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
    if (
      !doc ||
      doc.deletedAt !== undefined ||
      doc.createdByKeyId !== args.keyId
    ) {
      throw new ConvexError("Document not found");
    }
    const project = await ctx.db.get(doc.projectId);
    if (
      !project ||
      project.deletedAt !== undefined ||
      project.organizationId !== args.organizationId ||
      (args.scopeProjects !== "all" &&
        !args.scopeProjects.includes(doc.projectId))
    ) {
      throw new ConvexError("Document not found");
    }
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new ConvexError("Invalid key");

    const { bytes, warnings } = await applyDraftEdit(
      ctx,
      doc,
      { mode: args.mode, body: args.body, section: args.section },
      {
        organizationId: args.organizationId,
        userId: key.createdBy,
        details: { via: "api_key", keyId: args.keyId },
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
