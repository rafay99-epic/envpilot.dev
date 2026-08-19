"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import type { AuthUser, Organization, RoleMeta } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("hooks/use-auth");

interface UserData {
  user: AuthUser | null;
  organization: Organization | null;
  actions?: string[];
  /** Resolved capability map for the active org role (registry-driven). */
  capabilities?: Record<string, boolean>;
  /** Registry display metadata for the active org role. */
  roleMeta?: RoleMeta | null;
  accessToken: string | null;
  impersonator?: {
    email: string;
    reason: string | null;
  };
}

interface UseAuthReturn {
  user: AuthUser | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonator: { email: string; reason: string | null } | undefined;
  /** Check if the current user can perform an action (from backend authz).
   *  Actions are strings like "org:invite_member", "org:delete_project", "project:update".
   */
  canDo: (action: string) => boolean;
  /** All actions the current user can perform (from backend authz) */
  actions: string[];
  /** Registry capability map for the active org role (e.g. "project.variables.create"). */
  capabilities: Record<string, boolean>;
  /** Registry display metadata for the active org role (null while loading / no org). */
  roleMeta: RoleMeta | null;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

async function loadUser(): Promise<FetchState> {
  try {
    const response = await fetch("/api/auth/me");
    if (!response.ok) return { status: "failed" };
    return { status: "done", data: (await response.json()) as UserData };
  } catch (error) {
    log.error("fetch_user_failed", {}, error);
    return { status: "failed" };
  }
}

type FetchState =
  | { status: "idle" }
  | { status: "done"; data: UserData }
  | { status: "failed" };

/**
 * Client-side hook for accessing auth state
 * Note: For server components, use getUser() directly from @workos-inc/authkit-nextjs
 */
export function useAuth(
  initialData?: UserData,
  deferFetch = false
): UseAuthReturn {
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });

  // Derived, not synced into state. `initialData` streams in after mount on the
  // dashboard, so copying it in an effect meant the seed was dropped whenever
  // the effect did not re-run. A completed fetch is newer than the seed and
  // wins; a failed one means signed out.
  const source =
    fetchState.status === "done"
      ? fetchState.data
      : fetchState.status === "failed"
        ? null
        : (initialData ?? null);

  const user = source?.user ?? null;
  const organization = source?.organization ?? null;
  const actions = source?.actions ?? [];
  const capabilities = source?.capabilities ?? {};
  const roleMeta = source?.roleMeta ?? null;
  const impersonator = source?.impersonator;
  const isLoading = !source && fetchState.status !== "failed";

  // Fall back to /api/auth/me when the server could not supply the full
  // picture: no seed at all, no organization, or no actions.
  const needsFallbackFetch =
    !deferFetch &&
    (!initialData || !initialData.organization || !initialData.actions);

  useEffect(() => {
    if (!needsFallbackFetch) return;
    let cancelled = false;
    loadUser().then((next) => {
      if (!cancelled) setFetchState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [needsFallbackFetch]);

  // Re-fetch auth state when active organization changes (cookie update)
  useEffect(() => {
    const handler = () => void loadUser().then(setFetchState);
    window.addEventListener("org-context-changed", handler);
    return () => window.removeEventListener("org-context-changed", handler);
  }, []);

  // Keep Sentry user attribution in sync with auth state
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  return {
    user,
    organization,
    isLoading,
    isAuthenticated: !!user,
    isImpersonating: !!impersonator,
    impersonator,
    canDo: (action: string) => actions.includes(action),
    actions,
    capabilities,
    roleMeta,
    signOut: async () => {
      window.location.href = "/sign-out";
    },
    refreshUser: async () => setFetchState(await loadUser()),
  };
}
