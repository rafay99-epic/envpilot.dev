"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Shared-variable groups visible to the caller, for the org settings page. */
export function useSharedGroups(
  organizationId: Id<"organizations"> | undefined
) {
  const groups = useQuery(
    api.features.workspaces.queries.listByOrganization,
    organizationId ? { organizationId } : "skip"
  );
  return {
    groups: groups ?? [],
    isLoading: organizationId ? groups === undefined : false,
  };
}

/** One group with its rows and the projects that read them. */
export function useSharedGroupBySlug(
  organizationId: Id<"organizations"> | undefined,
  slug: string | undefined
) {
  return useQuery(
    api.features.workspaces.queries.getBySlug,
    organizationId && slug ? { organizationId, slug } : "skip"
  );
}

/** Rows a project reads from groups, with per-row edit rights and reach. */
export function useSharedRows(projectId: Id<"projects"> | undefined) {
  const rows = useQuery(
    api.features.workspaces.queries.listInheritedForProject,
    projectId ? { projectId } : "skip"
  );
  return {
    rows: rows ?? [],
    isLoading: projectId ? rows === undefined : false,
  };
}

export type SharedRow = ReturnType<typeof useSharedRows>["rows"][number];

/** Keys this project owns that other projects also own: `key -> others`. */
export function useDuplicateKeys(projectId: Id<"projects"> | undefined) {
  const rows = useQuery(
    api.features.workspaces.queries.duplicateKeys,
    projectId ? { projectId } : "skip"
  );
  return new Map((rows ?? []).map((row) => [row.key, row.others]));
}

export function useDuplicateKeysForOrganization(
  organizationId: Id<"organizations"> | undefined
) {
  return (
    useQuery(
      api.features.workspaces.queries.duplicateKeysForOrganization,
      organizationId ? { organizationId } : "skip"
    ) ?? []
  );
}

export function useShareActions() {
  return {
    preview: useAction(api.features.workspaces.share.preview),
    share: useAction(api.features.workspaces.share.share),
    unshare: useAction(api.features.workspaces.share.unshare),
    setVariableScope: useMutation(
      api.features.workspaces.mutations.setVariableScope
    ),
  };
}
