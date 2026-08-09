"use client";

import { useQuery, useMutation } from "convex/react";
import { api as convexApi } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Project documentation hooks.
 *
 * Two shapes on purpose, and the split matters for cost: every LIST is
 * metadata only (title, module, excerpt) and never carries a body, because
 * these are reactive subscriptions that re-run on any write. Only
 * `useProjectDoc` reads markdown, one page at a time.
 */

export type DocType = "api" | "guide";
export type DocStatus = "draft" | "published";

export interface DocSummary {
  _id: Id<"docs">;
  title: string;
  slug: string;
  module: string;
  type: DocType;
  status: DocStatus;
  excerpt?: string;
  authorId: Id<"users">;
  prUrl?: string;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
}

/** A search hit. `matchedBody` is true when the term was found in the page
 *  text rather than the title — the UI says so, so a result whose title does
 *  not contain the term does not look like a bug. */
export interface DocSearchResult extends DocSummary {
  matchedBody: boolean;
}

export interface DocDetail extends DocSummary {
  body: string;
  authorName: string;
  canEdit: boolean;
  canPublish: boolean;
  canDelete: boolean;
}

/**
 * Full-text search over a project's pages, backed by two Convex search
 * indexes (titles and page bodies). Skips entirely on an empty term so
 * clearing the box costs nothing, and callers should debounce — every call
 * is an index read.
 */
export function useDocSearch(
  projectId: Id<"projects"> | undefined,
  term: string
): DocSearchResult[] | undefined {
  return useQuery(
    convexApi.features.docs.queries.search,
    projectId && term.trim().length > 0
      ? { projectId, term: term.trim() }
      : "skip"
  );
}

/** All docs in a project the caller may see. Drafts are author-private. */
export function useProjectDocs(projectId: Id<"projects"> | undefined) {
  return useQuery(
    convexApi.features.docs.queries.listByProject,
    projectId ? { projectId } : "skip"
  ) as DocSummary[] | undefined;
}

/** One page WITH its body. The only read that touches docContent. */
export function useProjectDoc(
  projectId: Id<"projects"> | undefined,
  slug: string | undefined
) {
  return useQuery(
    convexApi.features.docs.queries.getBySlug,
    projectId && slug ? { projectId, slug } : "skip"
  ) as DocDetail | undefined;
}

export interface DocAccess {
  enabled: boolean;
  canCreate: boolean;
  canPublish: boolean;
  canDelete: boolean;
  /** Role capability AND tier, already combined by the backend. */
  canShare: boolean;
  canShareExternal: boolean;
  /** Role holds it, plan does not — show the upgrade, not an empty gap. */
  externalUpgradeRequired: boolean;
  atProjectLimit: boolean;
  atOrgLimit: boolean;
  projectCount: number;
  projectLimit: number | null;
  orgCount: number;
  orgLimit: number | null;
}

/** Role capabilities and remaining tier capacity, so the UI can hide an
 *  action instead of letting the user find out at save time. */
export function useDocAccess(projectId: Id<"projects"> | undefined) {
  return useQuery(
    convexApi.features.docs.queries.access,
    projectId ? { projectId } : "skip"
  ) as DocAccess | undefined;
}

export function useCreateDoc() {
  return useMutation(convexApi.features.docs.mutations.create);
}

export function useUpdateDoc() {
  return useMutation(convexApi.features.docs.mutations.update);
}

/** The human gate. Nothing else in the product sets status to published. */
export function usePublishDoc() {
  return useMutation(convexApi.features.docs.mutations.publish);
}

export function useUnpublishDoc() {
  return useMutation(convexApi.features.docs.mutations.unpublish);
}

export function useDeleteDoc() {
  return useMutation(convexApi.features.docs.mutations.remove);
}

export function useRestoreDoc() {
  return useMutation(convexApi.features.docs.mutations.restore);
}

/** Group docs by module, preserving each module's most-recent-first order. */
export function groupDocsByModule<T extends DocSummary>(
  docs: T[]
): Array<{ module: string; docs: T[] }> {
  const byModule = new Map<string, T[]>();
  for (const doc of docs) {
    const bucket = byModule.get(doc.module);
    if (bucket) bucket.push(doc);
    else byModule.set(doc.module, [doc]);
  }
  return Array.from(byModule.entries())
    .map(([module, entries]) => ({ module, docs: entries }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

// ─── Sharing ─────────────────────────────────────────────────────────────
//
// Two audiences, one table. Member shares are Convex mutations (the recipient
// is authenticated); public links go through /api/doc-shares because minting
// a token and deriving a scrypt hash both need Node crypto.

export type DocShareScope = "page" | "module";

export interface ProjectDocShare {
  _id: Id<"docShares">;
  scope: DocShareScope;
  audience: "member" | "external";
  status: "active" | "expired" | "revoked";
  /** Module name, or the page title. What was actually shared. */
  target: string;
  docSlug?: string;
  recipientName: string;
  token?: string;
  hasPassphrase: boolean;
  viewCount: number;
  lastViewedAt?: number;
  expiresAt: number;
  createdAt: number;
  createdByName: string;
  canRevoke: boolean;
}

export interface DocShareSummary {
  _id: Id<"docShares">;
  audience: "member" | "external";
  scope: DocShareScope;
  /** Module name, or the page title. */
  target: string;
  recipientName: string;
  token?: string;
  hasPassphrase: boolean;
  note?: string;
  viewCount: number;
  lastViewedAt?: number;
  expiresAt: number;
  isExpired: boolean;
  createdAt: number;
  createdByName: string;
  canRevoke: boolean;
}

export interface SharedWithMeEntry {
  _id: Id<"docShares">;
  scope: DocShareScope;
  title: string;
  module: string;
  /** 1 for a page share; the module's live page count for a module share. */
  pageCount: number;
  excerpt?: string;
  projectName: string;
  note?: string;
  expiresAt: number;
  sharedAt: number;
  sharedByName: string;
}

/** Everyone a page is currently shared with. */
export function useDocShares(docId: Id<"docs"> | undefined) {
  return useQuery(
    convexApi.features.docs.shares.listForDoc,
    docId ? { docId } : "skip"
  ) as DocShareSummary[] | undefined;
}

/**
 * Whether anything is shared with the caller. Deliberately separate from
 * `useSharedWithMe`: the nav asks this on every dashboard page and only needs
 * a yes/no, so it must not pay for resolving every share.
 */
export function useHasSharedWithMe() {
  return useQuery(convexApi.features.docs.shares.hasSharedWithMe, {}) as
    | boolean
    | undefined;
}

/** Pages other people handed to the signed-in reader. */
export function useSharedWithMe() {
  return useQuery(convexApi.features.docs.shares.listSharedWithMe, {}) as
    | SharedWithMeEntry[]
    | undefined;
}

/**
 * One shared page, or a shared module's index when `docSlug` is omitted.
 * A reactive query: it writes nothing, so the visit is recorded separately
 * by `useMarkShareViewed`.
 */
export function useSharedDoc(
  shareId: Id<"docShares"> | undefined,
  docSlug?: string
) {
  return useQuery(
    convexApi.features.docs.shares.readSharedByRecipient,
    shareId ? { shareId, docSlug } : "skip"
  );
}

/** Every documentation share in a project — the docs half of Shared. */
export function useProjectDocShares(projectId: Id<"projects"> | undefined) {
  return useQuery(
    convexApi.features.docs.shares.listForProject,
    projectId ? { projectId } : "skip"
  ) as ProjectDocShare[] | undefined;
}

export function useShareDocWithMembers() {
  return useMutation(convexApi.features.docs.shares.shareWithMembers);
}

export function useRevokeDocShare() {
  return useMutation(convexApi.features.docs.shares.revokeShare);
}

/** Fired once when a shared page opens — never from the render path. */
export function useMarkShareViewed() {
  return useMutation(convexApi.features.docs.shares.markShareViewed);
}
