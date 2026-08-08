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

export interface DocDetail extends DocSummary {
  body: string;
  authorName: string;
  canEdit: boolean;
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
export function groupDocsByModule(
  docs: DocSummary[]
): Array<{ module: string; docs: DocSummary[] }> {
  const byModule = new Map<string, DocSummary[]>();
  for (const doc of docs) {
    const bucket = byModule.get(doc.module);
    if (bucket) bucket.push(doc);
    else byModule.set(doc.module, [doc]);
  }
  return Array.from(byModule.entries())
    .map(([module, entries]) => ({ module, docs: entries }))
    .sort((a, b) => a.module.localeCompare(b.module));
}
