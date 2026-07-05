"use client";

import { useCallback } from "react";
import {
  useAccessToken,
  useAuth,
} from "@workos-inc/authkit-nextjs/components";

/**
 * Bridges the WorkOS AuthKit session to Convex's `ConvexProviderWithAuth`
 * contract, so the browser's Convex WebSocket carries a verified AuthKit JWT
 * and Convex functions can read the caller via `ctx.auth.getUserIdentity()`
 * (see convex/identity.ts and convex/auth.config.ts).
 *
 * Requires `AuthKitProvider` above it in the tree (mounted in
 * ConvexClientProvider.tsx). Token refresh is owned by AuthKit's tokenStore;
 * when Convex reports an expired token it passes `forceRefreshToken: true`
 * and we map that to a forced refresh.
 */
export function useConvexAuthFromWorkOS() {
  const { user, loading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const token = forceRefreshToken
        ? await refresh()
        : await getAccessToken();
      return token ?? null;
    },
    [getAccessToken, refresh]
  );

  return {
    isLoading: loading,
    isAuthenticated: !!user,
    fetchAccessToken,
  };
}
