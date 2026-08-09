/**
 * The one gate chain every shared documentation read passes through.
 *
 * Three surfaces reach a shared page — the "shared with me" dashboard route,
 * the public `/d/<token>` page, and the revoke/list views — and all of them
 * call `resolveShare`. A second copy of these checks is how a share link
 * outlives the page it points at.
 *
 * Nothing here trusts create-time state. `status` is a fast path the hourly
 * cron maintains; the truth is re-derived on every read, because unpublishing
 * a page, trashing it, losing org membership and a tier downgrade all have to
 * kill a live link the moment they happen.
 */
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { getActiveMembership } from "../../lib/authz";
import { checkBooleanFeature } from "../featureRegistry/gates";
import {
  resolveOrgGateContext,
  type OrgGateContext,
} from "../featureRegistry/resolver";

/** Longest a share may live. There is no permanent share. */
export const MAX_SHARE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Shortest useful TTL — mirrors the secret-share floor. */
export const MIN_SHARE_TTL_MS = 60 * 60 * 1000;
/** A sender's note is one line of context, not a second document. */
export const MAX_SHARE_NOTE_LENGTH = 280;
/** Recipients addressable in a single share action. */
export const MAX_SHARE_RECIPIENTS = 20;
/** Structural ceiling on one page's share list and its cascade sweep. */
export const MAX_SHARES_PER_DOC = 200;
/** Structural ceiling on one reader's "shared with me" list. */
export const MAX_SHARES_PER_RECIPIENT = 200;

export type ShareScope = "page" | "module";

/** Rows predate module sharing when `scope` is absent — they are all pages. */
export function shareScope(share: Doc<"docShares">): ShareScope {
  return share.scope ?? "page";
}

export type ResolvedShare = {
  share: Doc<"docShares">;
  doc: Doc<"docs">;
  project: Doc<"projects">;
};

export type ResolvedModuleShare = {
  share: Doc<"docShares">;
  project: Doc<"projects">;
  module: string;
  /** Published, non-deleted pages in the module, resolved at READ time. */
  docs: Doc<"docs">[];
};

/** Ceiling on the pages one module share will serve. */
export const MAX_MODULE_PAGES = 200;

/** Validates a caller-supplied TTL and returns the absolute expiry. */
export function resolveExpiry(ttlMs: number, now: number): number {
  if (!Number.isFinite(ttlMs) || ttlMs < MIN_SHARE_TTL_MS) {
    throw new ConvexError("A share must last at least one hour.");
  }
  if (ttlMs > MAX_SHARE_TTL_MS) {
    throw new ConvexError("A share may last at most 30 days.");
  }
  return now + Math.floor(ttlMs);
}

/**
 * Constant-time comparison of two hex digests.
 *
 * The attacker supplies one side and still has to brute-force the passphrase,
 * but a length-and-prefix compare leaks how much of a guess was right for
 * free, and not leaking it is also free.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Trims and bounds the sender's note. */
export function normalizeNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined;
  const trimmed = note.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_SHARE_NOTE_LENGTH) {
    throw new ConvexError(
      `Note is too long (${trimmed.length} characters). The limit is ${MAX_SHARE_NOTE_LENGTH}.`
    );
  }
  return trimmed;
}

/**
 * Per-organization tier context, memoized for one query invocation.
 *
 * `resolveShare` asks two boolean gates and each one otherwise re-resolves
 * the whole org → owner → tier chain. The "shared with me" list runs it per
 * row and is subscribed by the dashboard nav on every page, so without this
 * a reader with fifty shares pays a hundred tier resolutions per navigation.
 * Create one with `newGateCache()` and pass it to every call in a loop.
 */
export type GateCache = Map<string, Promise<OrgGateContext>>;

export function newGateCache(): GateCache {
  return new Map();
}

async function gateContext(
  ctx: QueryCtx | MutationCtx,
  organizationId: Id<"organizations">,
  cache: GateCache | undefined
): Promise<OrgGateContext | undefined> {
  if (!cache) return undefined;
  // The PROMISE is cached, not the value: two rows for the same organization
  // resolved concurrently would otherwise both miss and both do the work.
  let pending = cache.get(organizationId);
  if (!pending) {
    pending = resolveOrgGateContext(ctx.db, organizationId);
    cache.set(organizationId, pending);
  }
  return pending;
}

/**
 * Everything the two scopes check identically: liveness, the project, the
 * tier, and who the audience says may read. Split out so `resolveShare` and
 * `resolveModuleShare` cannot drift — a second copy of these checks is how a
 * share outlives the thing it points at.
 */
async function resolveShareCommon(
  ctx: QueryCtx | MutationCtx,
  share: Doc<"docShares"> | null,
  now: number,
  cache?: GateCache
): Promise<{ share: Doc<"docShares">; project: Doc<"projects"> } | null> {
  if (!share) return null;
  if (share.status !== "active") return null;
  if (share.expiresAt <= now) return null;

  const project = await ctx.db.get(share.projectId);
  if (!project || project.deletedAt !== undefined) return null;
  if (project.organizationId !== share.organizationId) return null;

  // Turning documentation off for an organization has to take its shares with
  // it, or the feature stays reachable from outside after being switched off.
  const gates = await gateContext(ctx, share.organizationId, cache);
  const docsEnabled = await checkBooleanFeature(
    ctx.db,
    share.organizationId,
    "project_docs",
    gates
  );
  if (!docsEnabled.allowed) return null;

  if (share.audience === "member") {
    if (!share.recipientUserId) return null;
    // Symmetric with the external branch below: turning sharing off for an
    // organization has to end the grants it already handed out, or the
    // switch only stops new ones.
    const sharingEnabled = await checkBooleanFeature(
      ctx.db,
      share.organizationId,
      "doc_sharing",
      gates
    );
    if (!sharingEnabled.allowed) return null;
    // Leaving or being suspended from the organization ends the grant. The
    // recipient never had project access, so nothing else would stop them.
    const membership = await getActiveMembership(
      ctx,
      share.organizationId,
      share.recipientUserId
    );
    if (!membership) return null;
  } else {
    if (!share.token) return null;
    // Re-checked per read, not per create: an organization that drops to a
    // tier without public links stops serving the ones it already minted.
    const linksEnabled = await checkBooleanFeature(
      ctx.db,
      share.organizationId,
      "doc_public_links",
      gates
    );
    if (!linksEnabled.allowed) return null;
  }

  return { share, project };
}

/**
 * Resolve a PAGE share to the one page it points at, or `null`.
 *
 * `null` rather than a descriptive throw, deliberately: a revoked link, an
 * expired one, one whose page was unpublished, one whose org downgraded and
 * one that never existed must all be indistinguishable from outside. Callers
 * turn every null into the same answer.
 */
export async function resolveShare(
  ctx: QueryCtx | MutationCtx,
  share: Doc<"docShares"> | null,
  now: number,
  cache?: GateCache
): Promise<ResolvedShare | null> {
  const base = await resolveShareCommon(ctx, share, now, cache);
  if (!base) return null;
  if (shareScope(base.share) !== "page" || !base.share.docId) return null;

  const doc = await ctx.db.get(base.share.docId);
  if (!doc || doc.deletedAt !== undefined) return null;
  // A draft is never shareable. Publication is the human review gate, and a
  // share that outran an unpublish would be a way around it.
  if (doc.status !== "published") return null;
  // The row is the authority on where the page lives; a share filed against
  // the wrong project would read another project's page.
  if (doc.projectId !== base.share.projectId) return null;

  return { share: base.share, doc, project: base.project };
}

/**
 * Resolve a MODULE share to the pages it currently covers.
 *
 * The page list is derived on every read rather than stored: that is what
 * makes a module share a subscription instead of a snapshot, so a page
 * published into the module tomorrow is included and one returned to draft
 * disappears — without anyone re-sharing anything.
 *
 * An EMPTY list is a valid result, not a failure. A module whose pages are
 * all drafts today resolves to zero pages and the reader sees an empty index,
 * which is the honest answer; collapsing it to null would make the link look
 * revoked and send the sender chasing a bug that is not there.
 */
export async function resolveModuleShare(
  ctx: QueryCtx | MutationCtx,
  share: Doc<"docShares"> | null,
  now: number,
  cache?: GateCache
): Promise<ResolvedModuleShare | null> {
  const base = await resolveShareCommon(ctx, share, now, cache);
  if (!base) return null;
  if (shareScope(base.share) !== "module" || !base.share.module) return null;

  const rows = await ctx.db
    .query("docs")
    .withIndex("by_project_and_module", (q) =>
      q.eq("projectId", base.share.projectId).eq("module", base.share.module!)
    )
    .take(MAX_MODULE_PAGES);

  const docs = rows
    .filter((doc) => doc.deletedAt === undefined && doc.status === "published")
    .sort((a, b) => a.title.localeCompare(b.title));

  return {
    share: base.share,
    project: base.project,
    module: base.share.module,
    docs,
  };
}

/** Active shares pointing at one page. Used by the list view and the
 *  unpublish / trash cascades. */
export async function activeSharesForDoc(
  ctx: QueryCtx | MutationCtx,
  docId: Id<"docs">
): Promise<Doc<"docShares">[]> {
  // Status is IN the index range, not filtered after the read. Filtering
  // afterwards takes the oldest rows for the doc — which are its revoked
  // history — so a page shared often enough would report no active shares
  // and its live links could not be revoked from the UI.
  return ctx.db
    .query("docShares")
    .withIndex("by_doc_status", (q) =>
      q.eq("docId", docId).eq("status", "active")
    )
    .take(MAX_SHARES_PER_DOC);
}

/**
 * Revoke every active share pointing at a page. Called when the page is
 * unpublished or trashed, so a live link dies with the thing it points at
 * rather than waiting for a reader to hit the gate chain and see nothing.
 */
export async function revokeSharesForDoc(
  ctx: MutationCtx,
  docId: Id<"docs">,
  revokedBy: Id<"users">,
  now: number
): Promise<number> {
  const active = await activeSharesForDoc(ctx, docId);
  for (const share of active) {
    await ctx.db.patch(share._id, {
      status: "revoked",
      revokedAt: now,
      revokedBy,
    });
  }
  return active.length;
}

/**
 * Delete every share row for a page being purged, live or dead.
 *
 * Revoked and expired rows go too: they are only kept as history for a page
 * that still exists, and the page is about to stop existing. Bounded rounds
 * rather than one `take` so a page with more shares than the list ceiling
 * cannot leave rows pointing at a deleted doc.
 */
export async function deleteSharesForDoc(
  ctx: MutationCtx,
  docId: Id<"docs">
): Promise<number> {
  let deleted = 0;
  // Rounds rather than one take. The bound is generous enough that no real
  // page reaches it; a page that somehow did would leave rows behind, so the
  // count is returned for the caller to log.
  //
  // `by_doc_status` queried on its `docId` prefix only — this wants every row
  // for the page, live or dead, and a prefix range gives exactly that without
  // a second index to maintain on every write.
  for (let round = 0; round < 5; round++) {
    const rows = await ctx.db
      .query("docShares")
      .withIndex("by_doc_status", (q) => q.eq("docId", docId))
      .take(MAX_SHARES_PER_DOC);
    for (const row of rows) {
      await ctx.db.delete(row._id);
      deleted++;
    }
    if (rows.length < MAX_SHARES_PER_DOC) break;
  }
  return deleted;
}
