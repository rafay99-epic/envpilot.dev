/**
 * Project documentation — reads.
 *
 * Everything except `get` returns METADATA ONLY. `docs` rows are small by
 * construction and bodies live in `docContent`; the sidebar and module index
 * are reactive subscriptions, so pulling markdown into them would re-read
 * every body in the project on every write. One body per page view, never a
 * body per list.
 */
import { v, ConvexError } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { listForUserCore } from "../projects/helpers";
import { readBody } from "./content";
import {
  canSeeDoc,
  MAX_DOC_ROWS,
  requireDocAccess,
  requireDocsFeature,
} from "./helpers";

/** Hard ceiling on one search response. Keeps a keystroke cheap. */
const SEARCH_LIMIT = 20;

/** Shape returned by every list surface — no body, no excerpt-less rows. */
function toSummary(doc: Doc<"docs">) {
  return {
    _id: doc._id,
    title: doc.title,
    slug: doc.slug,
    module: doc.module,
    type: doc.type,
    status: doc.status,
    excerpt: doc.excerpt,
    authorId: doc.authorId,
    prUrl: doc.prUrl,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    publishedAt: doc.publishedAt,
  };
}

/**
 * Every doc in a project the caller may see, newest first.
 *
 * Drafts are filtered per-row rather than by index: a caller sees published
 * pages plus their OWN drafts (plus everyone's, for Team Lead+), which is not
 * expressible as a single index range.
 */
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);

    const rows = await ctx.db
      .query("docs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .take(MAX_DOC_ROWS);

    return rows
      .filter((doc) => canSeeDoc(doc, actor._id, access))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(toSummary);
  },
});

/** One page by slug, WITH its body. The only read that touches docContent. */
export const getBySlug = query({
  args: { projectId: v.id("projects"), slug: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);

    const doc = await ctx.db
      .query("docs")
      .withIndex("by_project_and_slug", (q) =>
        q.eq("projectId", args.projectId).eq("slug", args.slug)
      )
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
      .first();

    // A draft the caller may not see is indistinguishable from a missing
    // page — an unreviewed page should not even be known to exist.
    if (!doc || !canSeeDoc(doc, actor._id, access)) {
      throw new ConvexError("Document not found");
    }

    const author = await ctx.db.get(doc.authorId);
    return {
      ...toSummary(doc),
      body: await readBody(ctx, doc._id),
      authorName: author?.name ?? author?.email ?? "Unknown",
      canEdit: doc.authorId === actor._id || access.canManage,
    };
  },
});

/**
 * Cross-project search over PUBLISHED pages, for the global command palette.
 *
 * Reuses `listForUserCore` for visibility rather than re-deriving org
 * membership and project assignment — that logic exists once and this must
 * not become a second copy of it.
 *
 * Bounded twice, like `variables.globalSearchWithAccess`: a per-project read
 * cap so one busy project cannot turn two keystrokes into a full scan, and an
 * overall result budget. Published only — the palette is a discovery surface
 * and a draft is nobody else's business.
 */
export const globalSearch = query({
  args: { searchTerm: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const needle = args.searchTerm.trim().toLowerCase();
    if (needle.length < 2) return [];

    const RESULT_LIMIT = 25;
    const PER_PROJECT_LIMIT = 100;

    const projects = await listForUserCore(ctx, actor._id);
    const results: Array<{
      _id: Id<"docs">;
      title: string;
      slug: string;
      module: string;
      type: "api" | "guide";
      projectName: string;
      projectSlug: string;
      projectColor?: string;
    }> = [];

    for (const project of projects) {
      if (results.length >= RESULT_LIMIT) break;
      const rows = await ctx.db
        .query("docs")
        .withIndex("by_project_and_status", (q) =>
          q.eq("projectId", project._id).eq("status", "published")
        )
        .filter((q) => q.eq(q.field("deletedAt"), undefined))
        .take(PER_PROJECT_LIMIT);

      for (const doc of rows) {
        if (results.length >= RESULT_LIMIT) break;
        const haystack =
          `${doc.title} ${doc.module} ${doc.excerpt ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
        results.push({
          _id: doc._id,
          title: doc.title,
          slug: doc.slug,
          module: doc.module,
          type: doc.type,
          projectName: project.name,
          projectSlug: project.slug,
          projectColor: project.color,
        });
      }
    }

    return results;
  },
});

/**
 * Soft-deleted docs for the project Trash page.
 *
 * Deliberately NOT tier-gated. Trash is a shared page listing variables,
 * accounts, files and docs together, so a gate throwing here would break the
 * whole page for an org without the feature. It costs nothing to allow: an
 * org that never had docs has none to list, and a downgraded org only sees
 * metadata it authored. Restoring is still gated, in the mutation.
 */
export const listTrashed = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);

    const rows = await ctx.db
      .query("docs")
      .withIndex("by_project_deleted", (q) => q.eq("projectId", args.projectId))
      .filter((q) => q.neq(q.field("deletedAt"), undefined))
      .take(MAX_DOC_ROWS);

    return rows
      .filter((doc) => doc.authorId === actor._id || access.canManage)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0))
      .map((doc) => ({ ...toSummary(doc), deletedAt: doc.deletedAt }));
  },
});

/**
 * Full-text search across a project's pages.
 *
 * Two Convex search indexes, merged: `docs.search_title` and
 * `docContent.search_body`. Title hits rank above body hits, because someone
 * typing "wallet" almost always wants the page called Wallet before a page
 * that merely mentions it.
 *
 * Cost shape — this is the read path an impatient user hits on every
 * keystroke, so it is bounded at every step:
 *   - `filterFields` pre-filter INSIDE each index, so a published-only search
 *     never reads a draft row at all (also why drafts cannot leak here).
 *   - Each index is capped with `.take()`, never `.collect()`.
 *   - Body hits return the parent's stored `excerpt`, never the body — the
 *     large rows are read by the index, never serialized back to the client.
 *   - Own drafts are folded in from a small metadata-only index read rather
 *     than a second search, so the private-draft case costs no extra index.
 */
export const search = query({
  args: { projectId: v.id("projects"), term: v.string() },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);

    const term = args.term.trim();
    if (term.length === 0) return [];

    // Published titles.
    const titleHits = await ctx.db
      .query("docs")
      .withSearchIndex("search_title", (q) =>
        q
          .search("title", term)
          .eq("projectId", args.projectId)
          .eq("status", "published")
      )
      .take(SEARCH_LIMIT);

    // Published bodies → parent metadata rows.
    const bodyHits = await ctx.db
      .query("docContent")
      .withSearchIndex("search_body", (q) =>
        q
          .search("body", term)
          .eq("projectId", args.projectId)
          .eq("status", "published")
      )
      .take(SEARCH_LIMIT);

    const ranked = new Map<
      string,
      { doc: Doc<"docs">; matchedBody: boolean }
    >();
    for (const doc of titleHits) {
      if (doc.deletedAt !== undefined) continue;
      ranked.set(doc._id, { doc, matchedBody: false });
    }
    for (const row of bodyHits) {
      if (ranked.has(row.docId)) continue;
      const doc = await ctx.db.get(row.docId);
      if (!doc || doc.deletedAt !== undefined) continue;
      if (doc.status !== "published") continue; // belt and braces
      ranked.set(doc._id, { doc, matchedBody: true });
    }

    // The caller's own drafts never reach a search index (they are filtered
    // out by `status`), so match them here against the same term. Bounded
    // metadata read, no bodies.
    const ownDrafts = await ctx.db
      .query("docs")
      .withIndex("by_project_and_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", "draft")
      )
      .take(MAX_DOC_ROWS);
    const needle = term.toLowerCase();
    for (const doc of ownDrafts) {
      if (doc.deletedAt !== undefined) continue;
      if (!canSeeDoc(doc, actor._id, access)) continue;
      if (ranked.has(doc._id)) continue;
      if (
        doc.title.toLowerCase().includes(needle) ||
        (doc.excerpt?.toLowerCase().includes(needle) ?? false)
      ) {
        ranked.set(doc._id, { doc, matchedBody: false });
      }
    }

    return [...ranked.values()]
      .slice(0, SEARCH_LIMIT)
      .map(({ doc, matchedBody }) => ({
        ...toSummary(doc),
        // Tells the UI why this row matched, so it can say "matched in page
        // text" instead of showing a title that does not contain the term.
        matchedBody,
      }));
  },
});
