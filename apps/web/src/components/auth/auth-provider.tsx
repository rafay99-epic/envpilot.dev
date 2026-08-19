"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import {
  AuthContext,
  type AuthContextValue,
} from "@/components/auth/auth-context";
import type { DashboardAuthSeed } from "@/lib/dashboard-auth";
import { AccessNotices } from "@/components/auth/AccessNotices";
import { AuthErrorPage } from "@/components/auth/auth-error-page";
import { BannedNotice } from "@/components/auth/banned-notice";

/**
 * Resolves the server's session promise without suspending.
 *
 * `use()` would suspend this component, and since it wraps the whole
 * dashboard that would put every route back behind the session lookup — the
 * exact thing streaming the promise is meant to avoid. Reading it in an
 * effect keeps children painting immediately.
 */
function useStreamedSeed(promise: Promise<DashboardAuthSeed>) {
  const [seed, setSeed] = useState<DashboardAuthSeed | null>(null);

  useEffect(() => {
    let active = true;
    promise.then(
      (value) => {
        if (active) setSeed(value);
      },
      () => {
        if (active) {
          setSeed({
            status: "error",
            kind: "auth",
            message: "We couldn't verify your identity. Please sign in again.",
          });
        }
      }
    );
    return () => {
      active = false;
    };
  }, [promise]);

  return seed;
}

export function AuthProvider({
  children,
  authPromise,
}: {
  children: ReactNode;
  authPromise: Promise<DashboardAuthSeed>;
}) {
  const router = useRouter();
  const seed = useStreamedSeed(authPromise);
  const ready = seed?.status === "ready" ? seed : null;

  const auth = useAuth(
    ready
      ? {
          user: ready.user,
          organization: ready.organization,
          actions: ready.actions,
          capabilities: ready.capabilities,
          roleMeta: ready.roleMeta,
          accessToken: null,
        }
      : undefined,
    // Until the seed lands there is nothing to fetch against — suppressing the
    // mount-time /api/auth/me keeps the streamed session from racing a
    // duplicate request for the same data.
    seed === null
  );

  useEffect(() => {
    if (seed?.status === "unauthenticated") router.replace("/sign-in");
  }, [seed?.status, router]);

  const value: AuthContextValue = {
    ...auth,
    hasOtherOrganizations: ready?.hasOtherOrganizations ?? false,
  };

  return (
    <AuthContext.Provider value={value}>
      {seed?.status === "error" ? (
        <AuthErrorPage
          title={seed.kind === "sync" ? "Account Sync Error" : undefined}
          message={seed.message}
        />
      ) : seed?.status === "banned" ? (
        <BannedNotice reason={seed.reason} />
      ) : (
        <>
          {/* Renders only overlays, and reads the pathname to exempt the
              org-switch escape route — nothing to approximate in the shell. */}
          <Suspense fallback={null}>
            <AccessNotices />
          </Suspense>
          {children}
        </>
      )}
    </AuthContext.Provider>
  );
}
