/**
 * Writes. `publish` is the ONLY function that sets `status: "published"`, and
 * it is a dashboard mutation behind a real user identity — everything an
 * agent can reach produces a draft. That gate is what stops a prompt-injected
 * page from reaching another agent. Every write runs `scanDocBody` first.
 */
import { v, ConvexError } from "convex/values";
import { mutation } from "../../_generated/server";
import { requireAuthedUser } from "../../lib/identity";
import { createAuditLog } from "../../lib/audit";
import { createBody, setContentStatus, writeBody } from "./content";
import { normalizePrUrl, scanDocBody, slugifyTitle } from "./guards";
import { templateFor } from "./templates";
import { revokeSharesForDoc } from "./shareGuards";
import {
  canDeleteDoc,
  canEditDoc,
  canPublishDoc,
  requireDocAccess,
  requireDocsFeature,
  requireDocCapacity,
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
    if (!access.canCreate) {
      throw new ConvexError(
        "Your role cannot create documentation pages in this project"
      );
    }
    await requireDocCapacity(ctx, access.project, args.projectId);

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
      // Never the body — it is already stored once in docContent.
      details: { title: args.title.trim(), module: args.module.trim(), slug },
    });

    return { docId, slug, warnings };
  },
});

/** Editing a published page returns it to draft — changed prose needs a
 *  second look before teammates and agents read it. */
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
      // null = unchanged; skip the metadata write.
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

    if (args.prUrl !== undefined) {
      // Compared, like title and module: an unchanged resubmit must not count
      // as an edit, or it would return a published page to draft for nothing.
      const prUrl = normalizePrUrl(args.prUrl);
      if (prUrl !== doc.prUrl) patch.prUrl = prUrl;
    }

    if (Object.keys(patch).length === 0) {
      return { slug: doc.slug, warnings, unpublished: false };
    }

    const unpublished = doc.status === "published";
    if (unpublished) {
      patch.status = "draft";
      patch.publishedAt = undefined;
      patch.publishedBy = undefined;
    }
    const now = Date.now();
    patch.updatedAt = now;
    await ctx.db.patch(doc._id, patch);

    // Editing a published page returns it to draft, and that has to take its
    // shares with it exactly as an explicit unpublish does. Without this the
    // grants stayed active on a draft and came back the moment the page was
    // republished — a share nobody re-authorized.
    let sharesRevoked = 0;
    if (unpublished) {
      await setContentStatus(ctx, doc._id, "draft");
      sharesRevoked = await revokeSharesForDoc(ctx, doc._id, actor._id, now);
    }

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.updated",
      details: {
        title: (patch.title as string) ?? doc.title,
        slug: (patch.slug as string) ?? doc.slug,
        returnedToDraft: unpublished,
        sharesRevoked,
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
 * THE human gate — only after this is a page visible to teammates or MCP.
 * Authors publish their own (the review is a correctness check by whoever
 * holds the intent, not an approval hierarchy); Team Lead+ publishes anyone's.
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
    if (!canPublishDoc(access)) {
      throw new ConvexError("Your role cannot publish documentation pages");
    }
    if (doc.status === "published") return { slug: doc.slug };

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      status: "published",
      publishedAt: now,
      publishedBy: actor._id,
      updatedAt: now,
    });
    // Search index filters on this; a stale value hides published pages or
    // exposes drafts.
    await setContentStatus(ctx, doc._id, "published");

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
    if (!canPublishDoc(access)) {
      throw new ConvexError("Your role cannot change a page's published state");
    }
    if (doc.status === "draft") return { slug: doc.slug };

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      status: "draft",
      publishedAt: undefined,
      publishedBy: undefined,
      updatedAt: now,
    });
    await setContentStatus(ctx, doc._id, "draft");

    // Returning a page to draft has to take its shares with it. The gate
    // chain would refuse them anyway, but a revoked row stops advertising
    // itself as live access in the sender's list and the recipient's inbox.
    const revoked = await revokeSharesForDoc(ctx, doc._id, actor._id, now);

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.updated",
      details: {
        title: doc.title,
        slug: doc.slug,
        returnedToDraft: true,
        sharesRevoked: revoked,
      },
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
    if (!canDeleteDoc(doc, actor._id, access)) {
      throw new ConvexError("Your role cannot delete documentation pages");
    }

    const now = Date.now();
    await ctx.db.patch(doc._id, {
      deletedAt: now,
      updatedAt: now,
    });

    // Same reason as unpublish: a trashed page must not leave live-looking
    // grants behind, on either audience.
    const revoked = await revokeSharesForDoc(ctx, doc._id, actor._id, now);

    await createAuditLog(ctx, {
      organizationId: access.project.organizationId,
      projectId: doc.projectId,
      userId: actor._id,
      action: "doc.deleted",
      details: { title: doc.title, slug: doc.slug, sharesRevoked: revoked },
    });

    return { ok: true };
  },
});

/** Restores as a DRAFT — the content has not been reviewed since deletion. */
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
    if (!canDeleteDoc(doc, actor._id, access)) {
      throw new ConvexError("Your role cannot restore documentation pages");
    }
    // Restoring re-occupies a slot, so it is bounded like a create.
    await requireDocCapacity(ctx, access.project, doc.projectId);

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
    await setContentStatus(ctx, doc._id, "draft");

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
