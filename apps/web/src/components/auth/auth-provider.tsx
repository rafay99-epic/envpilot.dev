"use client";

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import {
  AuthContext,
  type AuthContextValue,
} from "@/components/auth/auth-context";
import type { DashboardAuthSeed } from "@/lib/dashboard-auth";
import { AccessNotices } from "@/components/auth/AccessNotices";
import { AuthErrorPage } from "@/components/auth/auth-error-page";
import { BannedNotice } from "@/components/auth/banned-notice";

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
    seed === null
  );

  const hasOtherOrganizations = ready?.hasOtherOrganizations ?? false;
  const value: AuthContextValue = useMemo(
    () => ({ ...auth, hasOtherOrganizations }),
    [auth, hasOtherOrganizations]
  );

  return (
    <AuthContext.Provider value={value}>
      {seed?.status === "unauthenticated" ? (
        <AuthErrorPage
          title="Session Expired"
          message="Your session is no longer valid. Please sign in again."
          showTryAgain={false}
        />
      ) : seed?.status === "error" ? (
        <AuthErrorPage
          title={seed.kind === "sync" ? "Account Sync Error" : undefined}
          message={seed.message}
        />
      ) : seed?.status === "banned" ? (
        <BannedNotice reason={seed.reason} />
      ) : (
        <>
          <Suspense fallback={null}>
            <AccessNotices />
          </Suspense>
          {children}
        </>
      )}
    </AuthContext.Provider>
  );
}
