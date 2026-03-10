"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Hook to resolve the Convex user from a WorkOS user ID.
 * Returns the Convex user document (including _id) for use in
 * membership-aware queries.
 */
export function useConvexUser(workosId: string | undefined) {
  const convexUser = useQuery(
    api.users.getByWorkosId,
    workosId ? { workosId } : "skip"
  );

  return {
    convexUser: convexUser ?? null,
    convexUserId: convexUser?._id,
    isLoading: workosId ? convexUser === undefined : false,
  };
}
