"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export function useFavoriteProjects(userId: Id<"users"> | undefined) {
  // Identity is derived server-side from the attached JWT; `userId` only gates
  // the query until the current user is known (auth ready).
  const favorites = useQuery(api.favorites.listByUser, userId ? {} : "skip");

  const favoriteProjectIds = new Set(
    favorites?.map((f) => f.projectId as string) ?? []
  );

  return { favorites, favoriteProjectIds };
}

export function useToggleFavorite() {
  const toggleMutation = useMutation(api.favorites.toggle);

  // `userId` is accepted for call-site compatibility but no longer forwarded;
  // the acting user is derived server-side from the JWT.
  const toggle = async (_userId: Id<"users">, projectId: Id<"projects">) => {
    return toggleMutation({ projectId });
  };

  return { toggle };
}
