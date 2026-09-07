"use client";

import { useState, useSyncExternalStore } from "react";
import type { Id } from "@convex/_generated/dataModel";
import {
  useDuplicateKeysForOrganization,
  useSharingStatus,
  type DuplicateGroup,
} from "@/hooks";
import { MergeSheet } from "@/components/workspaces";
import { TerminalButton } from "@/components/dashboard/terminal-ui";

// Dismissal lives in localStorage, so it is an external store: the server
// snapshot keeps the banner out of the SSR pass and off the hydration diff,
// and the listener set is what re-renders the banner away on "Not now".
const dismissalListeners = new Set<() => void>();

function subscribeDismissal(onChange: () => void) {
  dismissalListeners.add(onChange);
  return () => {
    dismissalListeners.delete(onChange);
  };
}

function readDismissed(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

export function DuplicateKeysBanner({
  organizationId,
}: {
  organizationId: Id<"organizations"> | undefined;
}) {
  const { enabled } = useSharingStatus(organizationId);
  const duplicates = useDuplicateKeysForOrganization(
    enabled ? organizationId : undefined
  );
  const [merging, setMerging] = useState<DuplicateGroup[] | null>(null);
  const storageKey = `envpilot.duplicates-banner.${organizationId}`;
  const dismissed = useSyncExternalStore(
    subscribeDismissal,
    () => readDismissed(storageKey),
    () => true
  );

  if (dismissed || duplicates.length === 0) return null;

  // Unverified rows share a key but their values are only compared at merge.
  const verified = duplicates.filter((row) => row.verified);
  const shown = verified.length > 0 ? verified : duplicates;
  const projectCount = new Set(shown.flatMap((row) => row.projectIds)).size;

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // A blocked storage just means the banner returns next visit.
    }
    dismissalListeners.forEach((listener) => listener());
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
      <p className="text-sm text-ink">
        {shown.length} key{shown.length === 1 ? "" : "s"}{" "}
        {shown.length === 1 ? "is" : "are"}{" "}
        {verified.length > 0 ? "identical" : "duplicated"} across {projectCount}{" "}
        projects.{" "}
        <span className="text-ink-muted">
          Merge development and staging in one click. Production goes to
          approval.
        </span>
      </p>
      <div className="flex items-center gap-2">
        <TerminalButton variant="secondary" onClick={dismiss}>
          Not now
        </TerminalButton>
        <TerminalButton onClick={() => setMerging(duplicates)}>
          Merge
        </TerminalButton>
      </div>
      <MergeSheet
        organizationId={organizationId}
        groups={merging}
        onClose={() => setMerging(null)}
      />
    </div>
  );
}
