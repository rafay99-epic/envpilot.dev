/**
 * Documentation sharing — two audiences, one table, one gate chain.
 *
 * A project member can already read every published page in their project, so
 * sharing only means something in two cases: reaching an organization member
 * who is NOT on the project, and reaching someone who is not on the platform
 * at all. Both are grants to a PERSON or to a URL — never to a machine
 * identity. `features/api/docs.ts` (MCP / REST) must never read this table.
 *
 * Two shapes recur and are deliberate:
 *
 *  - Reads that count a view are MUTATIONS. Convex queries cannot write, and
 *    a reactive query that scheduled a write would log one audit row per
 *    re-run. The public path is a single mutation; the member path is a
 *    write-free reactive query plus one `markShareViewed` on mount.
 *
 *  - Every failure returns the SAME answer. A revoked link, an expired one, a
 *    page that was unpublished, a tier that lost the feature and a token that
 *    never existed are indistinguishable from outside.
 */
import { v, ConvexError } from "convex/values";
import { mutation, query } from "../../_generated/server";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { requireAuthedUser } from "../../lib/identity";
import { createAuditLog } from "../../lib/audit";
import { getActiveMembership } from "../../lib/authz";
import { rateLimiter } from "../../lib/rateLimits";
import {
  checkBooleanFeature,
  checkCountedLimit,
  countActiveDocLinks,
} from "../featureRegistry/gates";
import { readBody } from "./content";
import { requireDocAccess, requireDocsFeature } from "./helpers";
import {
  assertRecipientCapacity,
  assertShareCapacity,
  listLiveModulePages,
  MAX_MODULE_PAGES,
  MAX_SHARE_RECIPIENTS,
  MAX_SHARES_PER_DOC,
  MAX_SHARES_PER_RECIPIENT,
  newGateCache,
  normalizeNote,
  resolveExpiry,
  resolveModuleShare,
  resolveShare,
  shareScope,
  timingSafeEqualHex,
} from "./shareGuards";

/**
 * Deliberately conservative address check. Not RFC-complete — it exists so a
 * direct caller cannot push arbitrary text into an outbound `to:` header, and
 * Resend rejects anything that slips past a shape this narrow.
 */
function isPlausibleEmail(value: string): boolean {
  return (
    value.length <= 254 &&
    /^[^\s@,;<>"]+@[^\s@,;<>".]+\.[^\s@,;<>"]+$/.test(value)
  );
}

/** Tier gate for handing a page to a teammate. */
async function requireSharingFeature(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">
): Promise<void> {
  const gate = await checkBooleanFeature(ctx.db, organizationId, "doc_sharing");
  if (!gate.allowed) {
    throw new ConvexError(
      gate.reason ?? "Documentation sharing is not available on your plan."
    );
  }
}

/**
 * Load a page the caller may share, or throw.
 *
 * Published only, on both audiences. A draft is private to its author until a
 * human publishes it, and a share that could carry one would be a way around
 * the single review gate the whole documentation feature rests on.
 */
async function loadShareableDoc(
  ctx: QueryCtx | MutationCtx,
  actorId: Id<"users">,
  docId: Id<"docs">
) {
  const doc = await ctx.db.get(docId);
  if (!doc || doc.deletedAt !== undefined) {
    throw new ConvexError("Document not found");
  }
  const access = await requireDocAccess(ctx, actorId, doc.projectId);
  await requireDocsFeature(ctx, access.project.organizationId);
  if (doc.status !== "published") {
    throw new ConvexError(
      "Only a published page can be shared. Publish it first — a draft has not been reviewed yet."
    );
  }
  return { doc, access };
}

/** What a share points at, once validated. */
type ShareTarget = {
  scope: "page" | "module";
  docId?: Id<"docs">;
  module?: string;
  /** For the audit row and the email subject line. */
  label: string;
  /** Published pages the share will cover right now. */
  pageCount: number;
  access: Awaited<ReturnType<typeof requireDocAccess>>;
  projectId: Id<"projects">;
};

/**
 * Resolve and authorize whatever is being shared — one page, or a whole
 * module.
 *
 * Both paths land on the same authorization and the same published-only rule,
 * so neither scope can become the lenient one. A module with no published
 * pages is refused rather than shared: the recipient would open an empty
 * index and the sender would have no idea why.
 */
async function loadShareTarget(
  ctx: QueryCtx | MutationCtx,
  actorId: Id<"users">,
  args: { docId?: Id<"docs">; projectId?: Id<"projects">; module?: string }
): Promise<ShareTarget> {
  const wantsModule = args.module !== undefined;
  if (wantsModule === (args.docId !== undefined)) {
    throw new ConvexError("Share exactly one page or exactly one module.");
  }

  if (!wantsModule) {
    const { doc, access } = await loadShareableDoc(ctx, actorId, args.docId!);
    return {
      scope: "page",
      docId: doc._id,
      label: doc.title,
      pageCount: 1,
      access,
      projectId: doc.projectId,
    };
  }

  if (!args.projectId) {
    throw new ConvexError("A module share needs its project.");
  }
  const moduleName = args.module!.trim();
  if (moduleName.length === 0 || moduleName.length > 100) {
    throw new ConvexError("Module must be 1-100 characters");
  }

  const access = await requireDocAccess(ctx, actorId, args.projectId);
  await requireDocsFeature(ctx, access.project.organizationId);

  // One past the ceiling, so an oversize module is REFUSED rather than shared
  // as a silent partial. Published and live are in the index key, so this
  // reads real pages instead of filling up with drafts.
  const published = await listLiveModulePages(
    ctx,
    args.projectId,
    moduleName,
    MAX_MODULE_PAGES + 1
  );
  if (published.length > MAX_MODULE_PAGES) {
    throw new ConvexError(
      `"${moduleName}" has more than ${MAX_MODULE_PAGES} published pages, which is more than one share can carry. Split the module or share individual pages.`
    );
  }
  if (published.length === 0) {
    throw new ConvexError(
      `"${moduleName}" has no published pages yet. Publish at least one before sharing the module.`
    );
  }

  return {
    scope: "module",
    module: moduleName,
    label: moduleName,
    pageCount: published.length,
    access,
    projectId: args.projectId,
  };
}

/**
 * Refuse a share once the target already carries the maximum.
 *
 * Both list surfaces read at most `MAX_SHARES_PER_DOC` rows, and a module
 * share shows up in the list of every page in that module, so the module
 * needs the same ceiling as a page — otherwise the reads that bound
 * themselves would start hiding live grants nobody could then revoke.
 */
async function assertTargetCapacity(
  ctx: MutationCtx,
  target: ShareTarget
): Promise<void> {
  if (target.docId) {
    await assertShareCapacity(ctx, target.docId);
    return;
  }
  const existing = await ctx.db
    .query("docShares")
    .withIndex("by_project_module_status", (q) =>
      q
        .eq("projectId", target.projectId)
        .eq("module", target.module)
        .eq("status", "active")
    )
    .take(MAX_SHARES_PER_DOC);
  if (existing.length >= MAX_SHARES_PER_DOC) {
    throw new ConvexError(
      `"${target.module}" already has ${MAX_SHARES_PER_DOC} active shares. Revoke one before adding another.`
    );
  }
}

/** Shape returned to a reader who reached a page through a share. */
function sharedView(
  share: Doc<"docShares">,
  doc: Doc<"docs">,
  project: Doc<"projects">,
  body: string,
  authorName: string,
  sharedByName: string
) {
  return {
    title: doc.title,
    module: doc.module,
    body,
    authorName,
    sharedByName,
    projectName: project.name,
    note: share.note,
    expiresAt: share.expiresAt,
    publishedAt: doc.publishedAt,
    updatedAt: doc.updatedAt,
  };
}

/** Index a module reader sees: what is in it, not what is in each page. */
function moduleIndexView(
  share: Doc<"docShares">,
  project: Doc<"projects">,
  moduleName: string,
  docs: Doc<"docs">[],
  sharedByName: string
) {
  return {
    module: moduleName,
    projectName: project.name,
    sharedByName,
    note: share.note,
    expiresAt: share.expiresAt,
    // Metadata only — bodies are read one page at a time, exactly like the
    // dashboard listing, so opening an index never loads twenty markdown
    // bodies nobody asked for.
    pages: docs.map((doc) => ({
      slug: doc.slug,
      title: doc.title,
      excerpt: doc.excerpt,
      updatedAt: doc.updatedAt,
    })),
  };
}

async function displayName(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">
): Promise<string> {
  const user = await ctx.db.get(userId);
  return user?.name ?? user?.email ?? "Unknown";
}

// ==========================================
// WRITES
// ==========================================

/**
 * Hand a published page to named organization members.
 *
 * Upserts per (doc, recipient): re-sharing a page someone already holds
 * refreshes the grant instead of stacking a second row, a second entry in the
 * "shared with" list and a second email.
 */
export const shareWithMembers = mutation({
  args: {
    // Exactly one target: a page, or a module within a project.
    docId: v.optional(v.id("docs")),
    projectId: v.optional(v.id("projects")),
    module: v.optional(v.string()),
    recipientUserIds: v.array(v.id("users")),
    ttlMs: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const target = await loadShareTarget(ctx, actor._id, args);
    const access = target.access;
    const organizationId = access.project.organizationId;
    await requireSharingFeature(ctx, organizationId);

    if (!access.canShare) {
      throw new ConvexError(
        "Your role cannot share documentation. Ask a team lead or project manager."
      );
    }
    if (args.recipientUserIds.length === 0) {
      throw new ConvexError("Pick at least one person to share with.");
    }
    if (args.recipientUserIds.length > MAX_SHARE_RECIPIENTS) {
      throw new ConvexError(
        `You can share with at most ${MAX_SHARE_RECIPIENTS} people at once.`
      );
    }

    const now = Date.now();
    const expiresAt = resolveExpiry(args.ttlMs, now);
    const note = normalizeNote(args.note);

    // Deduped here rather than trusted from the client: the same id twice
    // would otherwise send the same person two emails.
    const recipientIds = Array.from(new Set(args.recipientUserIds));

    // Charged per RECIPIENT, because the cost being bounded is outbound
    // email. One token per call would have let 10 bursts x 20 recipients
    // send 200 messages against a limit that reads like 30.
    await rateLimiter.limit(ctx, "docShareCreate", {
      key: organizationId,
      count: recipientIds.length,
      throws: true,
    });
    const created: { userId: Id<"users">; email: string; name: string }[] = [];
    let refreshed = 0;

    for (const recipientUserId of recipientIds) {
      if (recipientUserId === actor._id) {
        throw new ConvexError("You already have access to this.");
      }
      // Membership is resolved server-side. The client picks from a list, but
      // the list is not the authority — this is.
      const membership = await getActiveMembership(
        ctx,
        organizationId,
        recipientUserId
      );
      if (!membership) {
        // Named, because the whole batch rolls back on this and "one of the
        // people you picked" leaves the sender guessing which of ten it was.
        const who = await ctx.db.get(recipientUserId);
        throw new ConvexError(
          `${who?.name ?? who?.email ?? "One of the people you picked"} is no longer an active member of this organization. Remove them and try again.`
        );
      }

      // Page shares hit a three-field index. Module shares have no docId to
      // key on, so they scan this recipient's own active shares — bounded by
      // MAX_SHARES_PER_RECIPIENT and far cheaper than a seventh index on a
      // table whose writes are already paying for six.
      const existing =
        target.scope === "page"
          ? await ctx.db
              .query("docShares")
              .withIndex("by_doc_recipient_status", (q) =>
                q
                  .eq("docId", target.docId)
                  .eq("recipientUserId", recipientUserId)
                  .eq("status", "active")
              )
              .first()
          : (
              await ctx.db
                .query("docShares")
                .withIndex("by_recipient_status", (q) =>
                  q
                    .eq("recipientUserId", recipientUserId)
                    .eq("status", "active")
                )
                .take(MAX_SHARES_PER_RECIPIENT)
            ).find(
              (row) =>
                row.projectId === target.projectId &&
                row.module === target.module
            );

      if (existing) {
        // They already hold a working grant. Extend it and stay quiet — a
        // second "X shared a page with you" for access they have is noise.
        await ctx.db.patch(existing._id, { expiresAt, note });
        refreshed++;
        continue;
      }

      await assertTargetCapacity(ctx, target);
      await assertRecipientCapacity(ctx, recipientUserId);

      await ctx.db.insert("docShares", {
        scope: target.scope,
        docId: target.docId,
        module: target.module,
        projectId: target.projectId,
        organizationId,
        createdBy: actor._id,
        audience: "member",
        recipientUserId,
        note,
        status: "active",
        expiresAt,
        viewCount: 0,
        createdAt: now,
      });

      const recipient = await ctx.db.get(recipientUserId);
      if (recipient) {
        created.push({
          userId: recipientUserId,
          email: recipient.email,
          name: recipient.name ?? recipient.email,
        });
      }
    }

    if (created.length > 0) {
      await createAuditLog(ctx, {
        organizationId,
        projectId: target.projectId,
        userId: actor._id,
        action: "doc.shared",
        details: {
          scope: target.scope,
          title: target.label,
          module: target.module,
          pageCount: target.pageCount,
          audience: "member",
          recipientCount: created.length,
          recipientEmails: created.map((r) => r.email),
          expiresAt,
        },
      });

      // Best-effort and scheduled: a Resend outage must never undo a grant
      // that is already valid in the database.
      await ctx.scheduler.runAfter(
        0,
        internal.features.emails.emails.sendDocSharedEmail,
        {
          recipients: created.map((r) => ({ email: r.email, name: r.name })),
          docTitle: target.label,
          // ONE email names the whole module. That is the point of the
          // module scope: twenty pages used to mean twenty shares and twenty
          // messages to the same person.
          pageCount: target.scope === "module" ? target.pageCount : undefined,
          projectName: access.project.name,
          sharedByName: actor.name ?? actor.email,
          note,
          expiresAt,
        }
      );
    }

    return { created: created.length, refreshed };
  },
});

/**
 * Mint a public preview link.
 *
 * The token and any passphrase hash are produced by the API route (Node
 * crypto), the way `/api/shares` mints secret-share tokens — this mutation
 * stores them and owns every gate.
 */
export const createPublicLink = mutation({
  args: {
    // Exactly one target: a page, or a module within a project.
    docId: v.optional(v.id("docs")),
    projectId: v.optional(v.id("projects")),
    module: v.optional(v.string()),
    token: v.string(),
    passphraseHash: v.optional(v.string()),
    passphraseSalt: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    ttlMs: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const target = await loadShareTarget(ctx, actor._id, args);
    const access = target.access;
    const organizationId = access.project.organizationId;

    if (!access.canShareExternal) {
      throw new ConvexError(
        "Your role cannot create public documentation links. Ask an owner or project manager."
      );
    }

    const boolGate = await checkBooleanFeature(
      ctx.db,
      organizationId,
      "doc_public_links"
    );
    if (!boolGate.allowed) {
      throw new ConvexError(
        boolGate.reason ??
          "Public documentation links are not available on your plan."
      );
    }

    // Counted lazily — an unlimited plan never pays for the scan.
    const linkLimit = await checkCountedLimit(
      ctx.db,
      organizationId,
      "max_active_doc_links",
      (limit) => countActiveDocLinks(ctx.db, organizationId, limit)
    );
    if (!linkLimit.allowed) {
      throw new ConvexError(
        `Your organization has reached its public link limit (${linkLimit.current}/${linkLimit.limit}). Revoke a link or upgrade.`
      );
    }

    if (
      (args.passphraseHash === undefined) !==
      (args.passphraseSalt === undefined)
    ) {
      throw new ConvexError("Passphrase hash and salt must travel together.");
    }

    // The token is minted by the API route with Node crypto, but this
    // mutation is publicly callable and must not trust that. Two things go
    // wrong without this check: a caller could store a guessable token
    // ("dshr_" + "a" * 64) for a real page, and the token is interpolated
    // into an href in the outbound email — an unvalidated one is HTML
    // injection into a message sent from the organization's own domain.
    if (!/^dshr_[0-9a-f]{64}$/.test(args.token)) {
      throw new ConvexError("Invalid share token.");
    }
    // Same reasoning: the route's Zod `.email()` never runs on a direct call,
    // and this address is what the notification is sent to.
    const recipientEmail = args.recipientEmail?.toLowerCase().trim();
    if (recipientEmail !== undefined && !isPlausibleEmail(recipientEmail)) {
      throw new ConvexError("Recipient email is not a valid address.");
    }

    const now = Date.now();
    const expiresAt = resolveExpiry(args.ttlMs, now);
    const note = normalizeNote(args.note);

    await rateLimiter.limit(ctx, "docShareCreate", {
      key: organizationId,
      throws: true,
    });

    await assertTargetCapacity(ctx, target);

    const shareId = await ctx.db.insert("docShares", {
      scope: target.scope,
      docId: target.docId,
      module: target.module,
      projectId: target.projectId,
      organizationId,
      createdBy: actor._id,
      audience: "external",
      token: args.token,
      passphraseHash: args.passphraseHash,
      passphraseSalt: args.passphraseSalt,
      recipientEmail,
      note,
      status: "active",
      expiresAt,
      viewCount: 0,
      createdAt: now,
    });

    await createAuditLog(ctx, {
      organizationId,
      projectId: target.projectId,
      userId: actor._id,
      action: "doc.shared",
      details: {
        scope: target.scope,
        title: target.label,
        module: target.module,
        pageCount: target.pageCount,
        audience: "external",
        hasPassphrase: args.passphraseHash !== undefined,
        recipientEmail,
        expiresAt,
      },
      involvesSensitiveData: true,
    });

    // Scheduled and best-effort: the link is valid the moment the row lands,
    // so a Resend outage must never fail the request and lose the creator a
    // token they cannot read back.
    if (recipientEmail) {
      await ctx.scheduler.runAfter(
        0,
        internal.features.emails.emails.sendDocLinkEmail,
        {
          to: recipientEmail,
          token: args.token,
          docTitle: target.label,
          pageCount: target.scope === "module" ? target.pageCount : undefined,
          projectName: access.project.name,
          sharedByName: actor.name ?? actor.email,
          note,
          hasPassphrase: args.passphraseHash !== undefined,
          expiresAt,
        }
      );
    }

    return { shareId, expiresAt };
  },
});

/**
 * Revoke a share. The sender may always revoke their own; anyone who can
 * delete the project's pages may revoke anyone's.
 */
export const revokeShare = mutation({
  args: { shareId: v.id("docShares") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share) throw new ConvexError("Share not found");

    const access = await requireDocAccess(ctx, actor._id, share.projectId);
    if (share.createdBy !== actor._id && !access.canDelete) {
      throw new ConvexError("Your role cannot revoke someone else's share.");
    }
    if (share.status !== "active") return { ok: true };

    const now = Date.now();
    await ctx.db.patch(share._id, {
      status: "revoked",
      revokedAt: now,
      revokedBy: actor._id,
    });

    // A module share names no page, so the audit row records whichever of the
    // two the share actually pointed at.
    const doc = share.docId ? await ctx.db.get(share.docId) : null;
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      userId: actor._id,
      action: "doc.share_revoked",
      details: {
        scope: shareScope(share),
        title: doc?.title,
        module: share.module,
        audience: share.audience,
        recipientEmail: share.recipientEmail,
      },
    });

    return { ok: true };
  },
});

/**
 * Count one view of a member share. Split out of the read because the read is
 * a reactive query: a subscription that re-runs on every unrelated change
 * would otherwise write an audit row each time.
 */
export const markShareViewed = mutation({
  args: { shareId: v.id("docShares") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    // Silent no-op rather than a throw: this fires from an effect, and the
    // reader already has (or does not have) the page either way.
    if (!share || share.recipientUserId !== actor._id) return { ok: false };

    const now = Date.now();
    // Both scopes, or a module share would never record a view and its
    // counter and audit trail would read as "never opened".
    const resolved =
      shareScope(share) === "module"
        ? await resolveModuleShare(ctx, share, now)
        : await resolveShare(ctx, share, now);
    if (!resolved) return { ok: false };

    await ctx.db.patch(share._id, {
      viewCount: share.viewCount + 1,
      lastViewedAt: now,
    });
    await createAuditLog(ctx, {
      organizationId: share.organizationId,
      projectId: share.projectId,
      // The share's creator, not the viewer: this row answers "who used the
      // link I created", and it keeps one attribution rule across both
      // audiences (an external viewer has no user row at all).
      userId: share.createdBy,
      action: "doc.share_viewed",
      details: {
        scope: shareScope(share),
        title:
          "doc" in resolved ? resolved.doc.title : (share.module ?? "module"),
        audience: "member",
        viewedByEmail: actor.email,
      },
    });
    return { ok: true };
  },
});

/**
 * Read a page through its public token, counting the view.
 *
 * A MUTATION on purpose: this is the anonymous path, it has to increment a
 * counter and write an audit row, and a query cannot.
 *
 * The passphrase is verified HERE, against a hash the API route derived with
 * the salt this function handed back. Convex is the only authority — there is
 * no "already unlocked" flag a caller could simply assert.
 */
export const readSharedByToken = mutation({
  args: {
    token: v.string(),
    /** Module links only: which page inside the module to open. */
    docSlug: v.optional(v.string()),
    passphraseHash: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const share = await ctx.db
      .query("docShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    // A module link resolves its pages here; a page link resolves its one
    // page. Both run the identical gate chain underneath.
    // One gate context for this read's two boolean checks, instead of
    // resolving the org/tier chain twice for a single page view.
    const gates = newGateCache();
    const isModule = share !== null && shareScope(share) === "module";
    const resolvedModule = isModule
      ? await resolveModuleShare(ctx, share, now, gates)
      : null;
    const resolved = isModule
      ? null
      : await resolveShare(ctx, share, now, gates);
    const live = resolvedModule ?? resolved;
    // One answer for every failure: unknown token, revoked, expired,
    // unpublished page, downgraded plan. Nothing distinguishes them.
    //
    // The ONE thing this surface does reveal is that a live token exists and
    // wants a passphrase, because a legitimate reader has to be told to enter
    // one. That is a deliberate, bounded trade: collapsing "locked" into
    // "unavailable" would leave every honest reader of a protected link
    // staring at "this link is no longer available", and the token is 64 hex
    // characters, so the disclosure only reaches someone who already holds a
    // candidate. The unlock endpoint gives nothing away either way — a wrong
    // passphrase and a token that never existed return the same 401 there.
    if (!live || live.share.audience !== "external") {
      return { status: "unavailable" as const };
    }

    if (live.share.passphraseHash !== undefined) {
      const supplied = args.passphraseHash;
      if (supplied === undefined) {
        // First visit — no attempt was made, so nothing is consumed.
        return {
          status: "locked" as const,
          salt: live.share.passphraseSalt,
        };
      }
      if (!timingSafeEqualHex(supplied, live.share.passphraseHash)) {
        // Only a real wrong guess costs a token from the bucket, and the
        // bucket is keyed on the TOKEN, never on the caller-supplied
        // ipAddress: this mutation is publicly callable, so an attacker who
        // could pick the key would simply send a fresh one per guess and
        // brute-force the passphrase at their own throughput.
        await rateLimiter.limit(ctx, "docShareUnlock", {
          key: args.token,
          throws: true,
        });
        return {
          status: "locked" as const,
          salt: live.share.passphraseSalt,
        };
      }
    }

    // A slug that is not in this module is resolved BEFORE anything is
    // counted: a wrong URL is not a view, and letting it through would let
    // anyone with the token inflate the counter and burn the view bucket by
    // requesting pages that do not exist.
    const requestedPage =
      resolvedModule && args.docSlug
        ? resolvedModule.docs.find((doc) => doc.slug === args.docSlug)
        : undefined;
    if (resolvedModule && args.docSlug && !requestedPage) {
      return { status: "unavailable" as const };
    }

    // A successful read writes an audit row and patches a counter, so it is
    // bounded too. Generous enough that ordinary reading and refreshing never
    // notices; low enough that one leaked token cannot fill an org's audit
    // log. Keyed on the token for the same reason as the unlock bucket.
    await rateLimiter.limit(ctx, "docShareView", {
      key: args.token,
      throws: true,
    });

    await ctx.db.patch(live.share._id, {
      viewCount: live.share.viewCount + 1,
      lastViewedAt: now,
    });

    await createAuditLog(ctx, {
      organizationId: live.share.organizationId,
      projectId: live.share.projectId,
      // Attributed to the creator — the reader is anonymous and `userId` is
      // required. Their context travels in `details` and the columns below,
      // exactly as `share.viewed` does for secret shares.
      userId: live.share.createdBy,
      action: "doc.share_viewed",
      details: {
        scope: shareScope(live.share),
        title: resolvedModule ? resolvedModule.module : resolved!.doc.title,
        audience: "external",
        recipientEmail: live.share.recipientEmail,
        // Reported, NOT trusted: this mutation is publicly callable, so a
        // direct caller picks these values freely. Kept because they are
        // useful when the request really did come through the API route, and
        // named so nobody reads them as verified request metadata. They stay
        // out of the audit row's own ipAddress/userAgent columns for the same
        // reason.
        reportedIpAddress: args.ipAddress,
        reportedUserAgent: args.userAgent,
      },
      involvesSensitiveData: true,
    });

    const sharedByName = await displayName(ctx, live.share.createdBy);

    if (resolvedModule) {
      // No page asked for — hand back the index of the module.
      if (!args.docSlug) {
        return {
          status: "ok" as const,
          kind: "module" as const,
          module: moduleIndexView(
            resolvedModule.share,
            resolvedModule.project,
            resolvedModule.module,
            resolvedModule.docs,
            sharedByName
          ),
        };
      }
      // A page WITHIN the module. Matched against the resolved list, so a
      // slug from another module — or a draft in this one — is simply not
      // found rather than being fetched and then checked.
      const page = requestedPage!;
      return {
        status: "ok" as const,
        kind: "page" as const,
        moduleName: resolvedModule.module,
        doc: sharedView(
          resolvedModule.share,
          page,
          resolvedModule.project,
          await readBody(ctx, page._id),
          await displayName(ctx, page.authorId),
          sharedByName
        ),
      };
    }

    return {
      status: "ok" as const,
      kind: "page" as const,
      moduleName: undefined,
      doc: sharedView(
        resolved!.share,
        resolved!.doc,
        resolved!.project,
        await readBody(ctx, resolved!.doc._id),
        await displayName(ctx, resolved!.doc.authorId),
        sharedByName
      ),
    };
  },
});

/**
 * Check a passphrase WITHOUT reading the page.
 *
 * Separate from `readSharedByToken` so an unlock attempt is not a view:
 * folding the two together would count a view and write an audit row for
 * every guess, and would double-count the one real read that follows.
 *
 * It returns no content, ever — only whether the hash matched, plus the salt
 * a caller needs to derive one. Answers are uniform across "no such token",
 * "not a public link" and "no passphrase set".
 */
export const verifyPassphrase = mutation({
  args: {
    token: v.string(),
    passphraseHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("docShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    const resolved = await resolveShare(ctx, share, Date.now());
    if (
      !resolved ||
      resolved.share.audience !== "external" ||
      resolved.share.passphraseHash === undefined
    ) {
      return { ok: false as const, salt: undefined };
    }

    // The salt probe consumes a token too, and that is the point: the API
    // route fetches the salt immediately before running scrypt, so charging
    // only for the comparison afterwards let a flood spend the server's whole
    // libuv pool on key derivations that the ten-attempt quota then rejected.
    // Charging first puts the limiter in front of the expensive work.
    await rateLimiter.limit(ctx, "docShareUnlock", {
      key: args.token,
      throws: true,
    });

    if (args.passphraseHash === undefined) {
      return { ok: false as const, salt: resolved.share.passphraseSalt };
    }

    if (
      !timingSafeEqualHex(args.passphraseHash, resolved.share.passphraseHash)
    ) {
      // Already charged above — one attempt, one token.
      return { ok: false as const, salt: resolved.share.passphraseSalt };
    }

    return { ok: true as const, salt: undefined };
  },
});

// ==========================================
// READS
// ==========================================

/** Everyone this page is currently shared with, for the sender's list. */
export const listForDoc = query({
  args: { docId: v.id("docs") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const doc = await ctx.db.get(args.docId);
    if (!doc || doc.deletedAt !== undefined) {
      throw new ConvexError("Document not found");
    }
    const access = await requireDocAccess(ctx, actor._id, doc.projectId);

    // Active rows come from the index range, not from a post-read filter:
    // `by_doc` alone is ordered by creation, so a page with a long share
    // history would fill the take with revoked rows and report none live.
    const direct = await ctx.db
      .query("docShares")
      .withIndex("by_doc_status", (q) =>
        q.eq("docId", args.docId).eq("status", "active")
      )
      .take(MAX_SHARES_PER_DOC);

    // Module shares covering this page's module count as sharing it, and the
    // sender needs to see them here — otherwise the page reads as private
    // while a module link is quietly serving it to the internet.
    //
    // Keyed on (project, module, status), NOT filtered after a project-wide
    // read: this runs on every documentation page view, and the unindexed
    // version scanned the project's whole share history each time.
    const viaModule = await ctx.db
      .query("docShares")
      .withIndex("by_project_module_status", (q) =>
        q
          .eq("projectId", doc.projectId)
          .eq("module", doc.module)
          .eq("status", "active")
      )
      .take(MAX_SHARES_PER_DOC);

    const active = [...direct, ...viaModule];
    const now = Date.now();

    return Promise.all(
      active.map(async (share) => ({
        _id: share._id,
        audience: share.audience,
        scope: shareScope(share),
        // Names what is shared, so a module row is not mistaken for a page.
        target: share.module ?? doc.title,
        recipientName: share.recipientUserId
          ? await displayName(ctx, share.recipientUserId)
          : (share.recipientEmail ?? "Anyone with the link"),
        // Withheld unless the caller could have minted the link themselves.
        // `project.docs.share` is enough to SEE that a public link exists —
        // that is just knowing where the team's documentation went — but the
        // token IS the credential, and handing it to a role without
        // `project.docs.share.external` lets them distribute a page outside
        // the organization, which is exactly what that capability gates.
        token: access.canShareExternal ? share.token : undefined,
        hasPassphrase: share.passphraseHash !== undefined,
        note: share.note,
        viewCount: share.viewCount,
        lastViewedAt: share.lastViewedAt,
        expiresAt: share.expiresAt,
        // Past its TTL but not yet swept by the hourly cron — shown as
        // expired rather than as a live grant it no longer is.
        isExpired: share.expiresAt <= now,
        createdAt: share.createdAt,
        createdByName: await displayName(ctx, share.createdBy),
        // Mirrors `revokeShare` exactly. Returning a flat `true` would render
        // a control that throws on click for anyone who is neither the
        // sender nor able to delete the project's pages.
        canRevoke: share.createdBy === actor._id || access.canDelete,
      }))
    );
  },
});

/**
 * Every documentation share in a project — the docs half of the project's
 * Shared tab, which lists shared variables alongside these.
 *
 * Unlike `listForDoc` this returns dead rows too: the tab has Expired and
 * Revoked filters, and a share that ended is exactly what someone auditing
 * "where did this go" needs to see.
 */
export const listForProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const access = await requireDocAccess(ctx, actor._id, args.projectId);

    const rows = await ctx.db
      .query("docShares")
      .withIndex("by_project_status", (q) => q.eq("projectId", args.projectId))
      .take(MAX_SHARES_PER_DOC * 2);

    const now = Date.now();
    return Promise.all(
      rows
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(async (share) => {
          const doc = share.docId ? await ctx.db.get(share.docId) : null;
          // Past its TTL but not yet swept by the hourly cron. Reported as
          // expired rather than as the live grant it no longer is.
          const status =
            share.status === "active" && share.expiresAt <= now
              ? ("expired" as const)
              : share.status;
          return {
            _id: share._id,
            scope: shareScope(share),
            audience: share.audience,
            status,
            target: share.module ?? doc?.title ?? "Deleted page",
            docSlug: doc?.slug,
            recipientName: share.recipientUserId
              ? await displayName(ctx, share.recipientUserId)
              : (share.recipientEmail ?? "Anyone with the link"),
            token: access.canShareExternal ? share.token : undefined,
            hasPassphrase: share.passphraseHash !== undefined,
            viewCount: share.viewCount,
            lastViewedAt: share.lastViewedAt,
            expiresAt: share.expiresAt,
            createdAt: share.createdAt,
            createdByName: await displayName(ctx, share.createdBy),
            canRevoke:
              share.status === "active" &&
              (share.createdBy === actor._id || access.canDelete),
          };
        })
    );
  },
});

/**
 * Whether anything is currently shared with the caller — nothing more.
 *
 * The dashboard nav subscribes to this on EVERY page to decide whether to
 * show the "Shared with me" entry, so it deliberately does not resolve the
 * shares: no page lookups, no tier resolution, and for module shares none of
 * the per-module page listing that `listSharedWithMe` does. One index read.
 *
 * The trade is that a share whose page was pulled out from under it can leave
 * the nav entry up for one visit, and the list then renders empty. Revoked
 * and expired rows are already excluded here, so the remaining cases are
 * rare — and a stray nav entry is a far smaller cost than resolving every
 * recipient's whole share set on every navigation.
 */
export const hasSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("docShares")
      .withIndex("by_recipient_status", (q) =>
        q.eq("recipientUserId", actor._id).eq("status", "active")
      )
      .take(MAX_SHARES_PER_RECIPIENT);
    return rows.some((row) => row.expiresAt > now);
  },
});

/** Pages other people have handed to the caller. */
export const listSharedWithMe = query({
  args: {},
  handler: async (ctx) => {
    const actor = await requireAuthedUser(ctx);
    const now = Date.now();

    const rows = await ctx.db
      .query("docShares")
      .withIndex("by_recipient_status", (q) =>
        q.eq("recipientUserId", actor._id).eq("status", "active")
      )
      .take(MAX_SHARES_PER_RECIPIENT);

    // One tier resolution per organization for the whole list, not two per
    // row. This query is subscribed by the dashboard nav on every page.
    const gates = newGateCache();
    const results = [];
    for (const share of rows) {
      if (shareScope(share) === "module") {
        const mod = await resolveModuleShare(ctx, share, now, gates);
        if (!mod) continue;
        results.push({
          _id: share._id,
          scope: "module" as const,
          title: mod.module,
          module: mod.module,
          // Resolved now, not stored: the count moves as the module grows.
          pageCount: mod.docs.length,
          excerpt: undefined as string | undefined,
          projectName: mod.project.name,
          note: share.note,
          expiresAt: share.expiresAt,
          sharedAt: share.createdAt,
          sharedByName: await displayName(ctx, share.createdBy),
        });
        continue;
      }
      const resolved = await resolveShare(ctx, share, now, gates);
      if (!resolved) continue;
      // Deliberately NOT resolving project access per row here. The dashboard
      // nav subscribes to this query on every page, and a membership +
      // assignment lookup per share would put hundreds of reads behind every
      // navigation. The reader route resolves it once, for the one page being
      // opened, and redirects — same outcome, off the hot path.
      results.push({
        _id: share._id,
        scope: "page" as const,
        title: resolved.doc.title,
        module: resolved.doc.module,
        pageCount: 1,
        excerpt: resolved.doc.excerpt,
        projectName: resolved.project.name,
        // No slugs: the list links to the share reader, which resolves the
        // canonical URL itself for the readers entitled to it. Returning them
        // here would hand a project/page slug to someone with no access.
        note: share.note,
        expiresAt: share.expiresAt,
        sharedAt: share.createdAt,
        sharedByName: await displayName(ctx, share.createdBy),
      });
    }
    return results.sort((a, b) => b.sharedAt - a.sharedAt);
  },
});

/**
 * One shared page, for a member reader. A reactive query, so it writes
 * NOTHING — `markShareViewed` records the visit separately.
 */
export const readSharedByRecipient = query({
  args: {
    shareId: v.id("docShares"),
    /** Module shares only: which page inside the module to open. */
    docSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireAuthedUser(ctx);
    const share = await ctx.db.get(args.shareId);
    if (!share || share.recipientUserId !== actor._id) {
      return { status: "unavailable" as const };
    }
    const now = Date.now();

    if (shareScope(share) === "module") {
      const resolvedModule = await resolveModuleShare(ctx, share, now);
      if (!resolvedModule || resolvedModule.share.audience !== "member") {
        return { status: "unavailable" as const };
      }
      const sharedByName = await displayName(ctx, share.createdBy);
      if (!args.docSlug) {
        return {
          status: "ok" as const,
          kind: "module" as const,
          module: moduleIndexView(
            resolvedModule.share,
            resolvedModule.project,
            resolvedModule.module,
            resolvedModule.docs,
            sharedByName
          ),
        };
      }
      const page = resolvedModule.docs.find((doc) => doc.slug === args.docSlug);
      if (!page) return { status: "unavailable" as const };
      return {
        status: "ok" as const,
        kind: "page" as const,
        moduleName: resolvedModule.module,
        projectSlug: (await callerCanOpenProject(
          ctx,
          actor._id,
          resolvedModule.project
        ))
          ? resolvedModule.project.slug
          : undefined,
        docSlug: page.slug,
        doc: sharedView(
          resolvedModule.share,
          page,
          resolvedModule.project,
          await readBody(ctx, page._id),
          await displayName(ctx, page.authorId),
          sharedByName
        ),
      };
    }

    const resolved = await resolveShare(ctx, share, now);
    if (!resolved || resolved.share.audience !== "member") {
      return { status: "unavailable" as const };
    }

    return {
      status: "ok" as const,
      kind: "page" as const,
      moduleName: undefined,
      // Lets the reader jump to the real page instead of the stripped-down
      // one when they turn out to have project access anyway.
      projectSlug: (await callerCanOpenProject(
        ctx,
        actor._id,
        resolved.project
      ))
        ? resolved.project.slug
        : undefined,
      docSlug: resolved.doc.slug,
      doc: sharedView(
        resolved.share,
        resolved.doc,
        resolved.project,
        await readBody(ctx, resolved.doc._id),
        await displayName(ctx, resolved.doc.authorId),
        await displayName(ctx, resolved.share.createdBy)
      ),
    };
  },
});

/**
 * Whether the caller could open this project through normal access, ignoring
 * shares. Used only to redirect a reader to the richer page — never to widen
 * what a share grants.
 */
async function callerCanOpenProject(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  project: Doc<"projects">
): Promise<boolean> {
  try {
    await requireDocAccess(ctx, userId, project._id);
    return true;
  } catch {
    return false;
  }
}
