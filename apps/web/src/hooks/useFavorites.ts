"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useFavoriteProjects(userId: Id<"users"> | undefined) {
  const favorites = useQuery(
    api.favorites.listByUser,
    userId ? { userId } : "skip"
  );

  const favoriteProjectIds = new Set(
    favorites?.map((f) => f.projectId as string) ?? []
  );

  return { favorites, favoriteProjectIds };
}

export function useToggleFavorite() {
  const toggleMutation = useMutation(api.favorites.toggle);

  const toggle = async (userId: Id<"users">, projectId: Id<"projects">) => {
    return toggleMutation({ userId, projectId });
  };

  return { toggle };
}
