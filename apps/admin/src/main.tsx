import { StrictMode, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAuth } from "@workos-inc/authkit-react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./app.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/** Adapts AuthKit's useAuth to the shape ConvexProviderWithAuth expects. */
function useAuthFromAuthKit() {
  const { isLoading, user, getAccessToken } = useAuth();
  const fetchAccessToken = useCallback(async () => {
    try {
      return (await getAccessToken()) ?? null;
    } catch {
      return null;
    }
  }, [getAccessToken]);
  return useMemo(
    () => ({ isLoading, isAuthenticated: !!user, fetchAccessToken }),
    [isLoading, user, fetchAccessToken]
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthKitProvider clientId={import.meta.env.VITE_WORKOS_CLIENT_ID}>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <RouterProvider router={router} />
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  </StrictMode>
);
