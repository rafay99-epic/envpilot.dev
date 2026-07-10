"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/**
 * Hook to resolve the Convex user from a WorkOS user ID.
 * Returns the Convex user document (including _id) for use in
 * membership-aware queries.
 */
export function useConvexUser(workosId: string | undefined) {
  // Gate on the Convex client's OWN auth state, not just the app-level
  // WorkOS user: `workosId` is available immediately (SSR-hydrated) while
  // the JWT attach to the Convex socket is still in flight. Firing then
  // throws the transient "Unauthenticated: no verified user identity"
  // race — and every downstream convexUserId-gated query inherits the
  // same window. isAuthenticated flips only after the token is attached.
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const authReady = !authLoading && isAuthenticated;

  const convexUser = useQuery(
    api.features.users.users.getByWorkosId,
    workosId && authReady ? { workosId } : "skip"
  );

  return {
    convexUser: convexUser ?? null,
    convexUserId: convexUser?._id,
    isLoading: workosId ? convexUser === undefined : false,
  };
}
