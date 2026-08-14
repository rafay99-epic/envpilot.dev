"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useFavoriteProjects(userId: Id<"users"> | undefined) {
  // Identity is derived server-side from the attached JWT; `userId` only gates
  // the query until the current user is known (auth ready).
  const projectIds = useQuery(
    api.features.projects.favorites.listByUser,
    userId ? {} : "skip"
  );

  return {
    favoriteProjectIds: new Set<string>(projectIds ?? []),
    isLoading: userId ? projectIds === undefined : false,
  };
}

/**
 * Toggling is applied optimistically: the star fills (and a favorites-first
 * list re-sorts) on click rather than after the round-trip, and Convex rolls
 * the local edit back on its own if the mutation fails.
 */
export function useToggleFavorite() {
  const toggle = useMutation(
    api.features.projects.favorites.toggle
  ).withOptimisticUpdate((localStore, { projectId }) => {
    const current = localStore.getQuery(
      api.features.projects.favorites.listByUser,
      {}
    );
    if (current === undefined) return;

    localStore.setQuery(
      api.features.projects.favorites.listByUser,
      {},
      current.includes(projectId)
        ? current.filter((id) => id !== projectId)
        : [...current, projectId]
    );
  });

  return { toggle };
}
