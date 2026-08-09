/**
 * Reads. Everything except `getBySlug` returns METADATA ONLY — one body per
 * page view, never a body per list, since these are reactive subscriptions.
 */
import { v, ConvexError } from "convex/values";
import { query } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countOrgDocs,
  countProjectDocs,
} from "../featureRegistry/gates";
import { listForUserCore } from "../projects/helpers";
import { readBody } from "./content";
import {
  canDeleteDoc,
  canEditDoc,
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
 * What the caller may do with this project's docs, plus how much room is
 * left. The UI reads this to hide actions a role cannot perform and to
 * explain a full tier BEFORE the user writes a page and loses it on save.
 */
export const access = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const docAccess = await requireDocAccess(ctx, actor._id, args.projectId);
    const orgId = docAccess.project.organizationId;

    const enabled = (await checkBooleanFeature(ctx.db, orgId, "project_docs"))
      .allowed;

    // Counted lazily: an unlimited tier never renders the banner, so it must
    // not pay for an org-wide fan-out on every reactive re-run.
    const perProject = await checkCountedLimit(
      ctx.db,
      orgId,
      "max_docs_per_project",
      (limit) => countProjectDocs(ctx.db, args.projectId, limit)
    );
    const perOrg = await checkCountedLimit(
      ctx.db,
      orgId,
      "max_docs_per_org",
      (limit) => countOrgDocs(ctx.db, orgId, limit)
    );

    // Both sharing gates resolve here so the drawer can hide a tab rather
    // than offer an action whose mutation will refuse it.
    const sharingEnabled = (
      await checkBooleanFeature(ctx.db, orgId, "doc_sharing")
    ).allowed;
    const publicLinksEnabled = (
      await checkBooleanFeature(ctx.db, orgId, "doc_public_links")
    ).allowed;

    return {
      enabled,
      canCreate: enabled && docAccess.canCreate,
      canPublish: docAccess.canPublish,
      canDelete: docAccess.canDelete,
      canShare: sharingEnabled && docAccess.canShare,
      canShareExternal: publicLinksEnabled && docAccess.canShareExternal,
      // Capability yes, plan no. Distinguished from a plain `false` so the
      // drawer can explain the upgrade rather than silently hiding a feature
      // the user's role genuinely holds.
      externalUpgradeRequired:
        docAccess.canShareExternal && !publicLinksEnabled,
      atProjectLimit: !perProject.allowed,
      atOrgLimit: !perOrg.allowed,
      projectCount: perProject.current,
      projectLimit: perProject.limit,
      orgCount: perOrg.current,
      orgLimit: perOrg.limit,
    };
  },
});

/** Docs the caller may see, newest first. Drafts filter per-row: "published
 *  plus my own" is not expressible as one index range. */
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
      .take(MAX_DOC_ROWS + 1);

    // Loud, like the secret-file listing: a silently truncated list reads as
    // "that page does not exist".
    if (rows.length > MAX_DOC_ROWS) {
      throw new ConvexError(
        `Project has more than ${MAX_DOC_ROWS} documentation pages — refusing a partial listing. Contact support to raise the limit.`
      );
    }

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

    // An unseeable draft must be indistinguishable from a missing page.
    if (!doc || !canSeeDoc(doc, actor._id, access)) {
      throw new ConvexError("Document not found");
    }

    const author = await ctx.db.get(doc.authorId);
    return {
      ...toSummary(doc),
      body: await readBody(ctx, doc._id),
      authorName: author?.name ?? author?.email ?? "Unknown",
      // Split so the UI can show exactly the actions the role allows,
      // instead of one flag standing in for three different capabilities.
      canEdit: canEditDoc(doc, actor._id, access),
      canPublish: access.canPublish,
      canDelete: canDeleteDoc(doc, actor._id, access),
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

    // One gate lookup per org, not per project — a downgraded org's pages
    // must not keep surfacing in the palette.
    const gated = new Map<string, boolean>();

    for (const project of projects) {
      if (results.length >= RESULT_LIMIT) break;
      const orgId = project.organizationId as string;
      if (!gated.has(orgId)) {
        const gate = await checkBooleanFeature(
          ctx.db,
          project.organizationId,
          "project_docs"
        );
        gated.set(orgId, gate.allowed);
      }
      if (!gated.get(orgId)) continue;

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

    // `undefined` sorts first in the index, so the lower bound skips every
    // live row instead of reading it to filter it out; descending keeps the
    // NEWEST deletions when a project overflows the cap.
    const rows = await ctx.db
      .query("docs")
      .withIndex("by_project_deleted", (q) =>
        q.eq("projectId", args.projectId).gt("deletedAt", 0)
      )
      .order("desc")
      .take(MAX_DOC_ROWS);

    return rows
      .filter((doc) => canDeleteDoc(doc, actor._id, access))
      .map((doc) => ({ ...toSummary(doc), deletedAt: doc.deletedAt }));
  },
});

/**
 * Full-text search: `docs.search_title` merged with `docContent.search_body`,
 * titles ranked first.
 *
 * Bounded at every step, since a user hits this per keystroke: `filterFields`
 * pre-filter drafts inside each index (cost AND confidentiality), every read
 * is `.take()`, and body hits return the parent's `excerpt` rather than the
 * body itself.
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
      // Trashed rows keep their published status, so without this they eat
      // hits and a live page falls off the end of the limit.
      .filter((q) => q.eq(q.field("deletedAt"), undefined))
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

    // Own drafts are filtered out of the indexes by `status`, so match them
    // here. Bounded metadata read, no bodies.
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
        // Lets the UI explain a hit whose title lacks the term.
        matchedBody,
      }));
  },
});
