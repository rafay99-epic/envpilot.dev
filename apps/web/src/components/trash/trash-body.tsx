"use client";

import { Trash2 } from "lucide-react";
import { RETENTION_DAYS } from "./retention";
import { TrashAccountsSection } from "./trash-accounts-section";
import { TrashDocsSection } from "./trash-docs-section";
import { TrashFilesSection } from "./trash-files-section";
import { TrashVariablesSection } from "./trash-variables-section";
import type { TrashLists, TrashSectionProps } from "./trash-items";

// Skeleton, empty state, or the four trash lists.
export function TrashBody({
  lists,
  loading,
  totalCount,
  convexUserId,
  ...section
}: TrashSectionProps & {
  lists: TrashLists;
  loading: boolean;
  totalCount: number;
  convexUserId: string | undefined;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border p-6 border-line bg-surface">
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg bg-surface-raised"
            />
          ))}
        </div>
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-16 text-center border-line bg-surface">
        <Trash2 className="mx-auto h-10 w-10 text-ink-faint" />
        <h2 className="mt-4 font-semibold text-ink">Trash is empty</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Deleted variables and shared accounts will appear here for{" "}
          {RETENTION_DAYS} days before being permanently destroyed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TrashVariablesSection variables={lists.variables} {...section} />
      <TrashAccountsSection
        accounts={lists.accounts}
        convexUserId={convexUserId}
        {...section}
      />
      <TrashFilesSection files={lists.files} {...section} />
      <TrashDocsSection docs={lists.docs} {...section} />
    </div>
  );
}
