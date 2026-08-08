/**
 * Project documentation — writes.
 *
 * The one invariant worth stating twice: **publishing is a human act.**
 * `publish` is the only function that sets `status: "published"`, it is a
 * dashboard mutation behind a real user identity, and no MCP tool calls it.
 * Everything an agent can reach produces a draft, and drafts are returned by
 * no MCP read at all — that gate is what stops a prompt-injected page from
 * ever reaching another agent's context.
 *
 * Every write runs `scanDocBody` first: documentation may NAME a variable and
 * must never carry its value, and it may describe the MCP tools but never
 * issue instructions to them.
 */
import { v, ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { createAuditLog } from "../../lib/audit";
import { createBody, writeBody } from "./content";
import { normalizePrUrl, scanDocBody, slugifyTitle } from "./guards";
import { templateFor } from "./templates";
import {
  canEditDoc,
  requireDocAccess,
  requireDocsFeature,
  uniqueSlug,
} from "./helpers";

const docTypeValidator = v.union(v.literal("api"), v.literal("guide"));

function assertTitle(title: string): void {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > 200) {
    throw new ConvexError("Title must be 1-200 characters");
  }
}

function assertModule(moduleName: string): void {
  const trimmed = moduleName.trim();
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new ConvexError("Module must be 1-100 characters");
  }
}

/** Create a draft. Never publishes — that is a separate, human, step. */
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    module: v.string(),
    type: docTypeValidator,
    title: v.string(),
    // Omitted by the dashboard "new page" flow, which starts from the
    // template for the chosen type.
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);

    assertTitle(args.title);
    assertModule(args.module);

    const body = args.body ?? templateFor(args.type);
    const { warnings } = scanDocBody(body);

    const slug = await uniqueSlug(
      ctx,
      args.projectId,
      slugifyTitle(args.title)
    );
    const now = Date.now();

    const docId = await ctx.db.insert("docs", {
      projectId: args.projectId,
      module: args.module.trim(),
      type: args.type,
      title: args.title.trim(),
      slug,
      status: "draft",
      authorId: actor._id,
      prUrl: normalizePrUrl(args.prUrl),
      createdAt: now,
      updatedAt: now,
    });

    const excerpt = await createBody(ctx, docId, args.projectId, body);
    await ctx.db.patch(docId, { excerpt });

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: args.projectId,
      userId: actor._id,
      action: "doc.created",
      // Never the body: it is already stored once in docContent, and an
      // audit row is the wrong place for a second copy.
      details: { title: args.title.trim(), module: args.module.trim(), slug },
    });

    return { docId, slug, warnings };
  },
});

/**
 * Update a page. Editing a PUBLISHED page returns it to draft: the reviewed
 * state was the published one, so changed prose needs a human to look again
 * before teammates and agents read it.
 */
export const update = mutation({
  args: {
    docId: v.id("docs"),
    title: v.optional(v.string()),
    module: v.optional(v.string()),
    body: v.optional(v.string()),
    prUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt !== undefined) {
      throw new ConvexError("Document not found");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);
    if (!canEditDoc(doc, actor._id, access)) {
      throw new ConvexError("You do not have permission to edit this page");
    }

    const patch: Record<string, unknown> = {};
    let warnings: string[] = [];

    if (args.body !== undefined) {
      warnings = scanDocBody(args.body).warnings;
      const excerpt = await writeBody(ctx, doc._id, doc.projectId, args.body);
      // null = byte-identical to what is stored; skip the metadata write so
      // an unchanged re-submit costs one read and no writes.
      if (excerpt !== null) patch.excerpt = excerpt;
    }

    if (args.title !== undefined && args.title.trim() !== doc.title) {
      assertTitle(args.title);
      patch.title = args.title.trim();
      patch.slug = await uniqueSlug(
        ctx,
        doc.projectId,
        slugifyTitle(args.title),
        doc._id
      );
    }

    if (args.module !== undefined && args.module.trim() !== doc.module) {
      assertModule(args.module);
      patch.module = args.module.trim();
    }

    if (args.prUrl !== undefined) patch.prUrl = normalizePrUrl(args.prUrl);

    if (Object.keys(patch).length === 0) {
      return { slug: doc.slug, warnings, unpublished: false };
    }

    const unpublished = doc.status === "published";
    if (unpublished) {
      patch.status = "draft";
      patch.publishedAt = undefined;
      patch.publishedBy = undefined;
    }
    patch.updatedAt = Date.now();
    await ctx.db.patch(doc._id, patch);

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.updated",
      details: {
        title: (patch.title as string) ?? doc.title,
        slug: (patch.slug as string) ?? doc.slug,
        returnedToDraft: unpublished,
      },
    });

    return {
      slug: (patch.slug as string) ?? doc.slug,
      warnings,
      unpublished,
    };
  },
});

/**
 * Publish a draft. THE human gate.
 *
 * Only after this does a page become visible to teammates and returnable by
 * `envpilot_search_docs` / `envpilot_get_doc`. Authors publish their own
 * pages — the review is a correctness check by the person who holds the
 * intent, not an approval hierarchy — and Team Lead+ may publish anyone's.
 */
export const publish = mutation({
  args: { docId: v.id("docs") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt !== undefined) {
      throw new ConvexError("Document not found");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);
    if (!canEditDoc(doc, actor._id, access)) {
      throw new ConvexError("You do not have permission to publish this page");
    }
    if (doc.status === "published") return { slug: doc.slug };

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      status: "published",
      publishedAt: now,
      publishedBy: actor._id,
      updatedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.published",
      details: { title: doc.title, slug: doc.slug, module: doc.module },
    });

    return { slug: doc.slug };
  },
});

/** Return a published page to draft without editing it. */
export const unpublish = mutation({
  args: { docId: v.id("docs") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt !== undefined) {
      throw new ConvexError("Document not found");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);
    if (!canEditDoc(doc, actor._id, access)) {
      throw new ConvexError("You do not have permission to edit this page");
    }
    if (doc.status === "draft") return { slug: doc.slug };

    await ctx.db.patch(doc._id, {
      status: "draft",
      publishedAt: undefined,
      publishedBy: undefined,
      updatedAt: Date.now(),
    });

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.updated",
      details: { title: doc.title, slug: doc.slug, returnedToDraft: true },
    });

    return { slug: doc.slug };
  },
});

/** Soft delete — recoverable from the project Trash until the purge cron. */
export const remove = mutation({
  args: { docId: v.id("docs") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt !== undefined) {
      throw new ConvexError("Document not found");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);
    if (!canEditDoc(doc, actor._id, access)) {
      throw new ConvexError("You do not have permission to delete this page");
    }

    await ctx.db.patch(doc._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.deleted",
      details: { title: doc.title, slug: doc.slug },
    });

    return { ok: true };
  },
});

/**
 * Restore from trash. Always comes back as a DRAFT: whatever it said when it
 * was deleted has not been reviewed since, and restoring straight to
 * published would hand unreviewed text back to every reader.
 */
export const restore = mutation({
  args: { docId: v.id("docs") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt === undefined) {
      throw new ConvexError("Document not found in trash");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);
    await requireDocsFeature(ctx, access.project.organizationId);
    if (!canEditDoc(doc, actor._id, access)) {
      throw new ConvexError("You do not have permission to restore this page");
    }

    // The slug may have been taken while this row sat in the trash.
    const slug = await uniqueSlug(ctx, doc.projectId, doc.slug, doc._id);

    await ctx.db.patch(doc._id, {
      deletedAt: undefined,
      status: "draft",
      publishedAt: undefined,
      publishedBy: undefined,
      slug,
      updatedAt: Date.now(),
    });

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.restored",
      details: { title: doc.title, slug },
    });

    return { slug };
  },
});
