"use client";

import { useCallback, useEffect, useState } from "react";
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

/**
 * Client-side hook for accessing auth state.
 * Note: For server components, use getUser() directly from @workos-inc/authkit-nextjs
 *
 * @param deferFetch  Set while the server's session payload is still streaming
 *   in. Without it the hook fires /api/auth/me on mount and races the streamed
 *   seed for the same data.
 */
export function useAuth(
  initialData?: UserData,
  deferFetch = false
): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(initialData?.user ?? null);
  const [organization, setOrganization] = useState<Organization | null>(
    initialData?.organization ?? null
  );
  const [actions, setActions] = useState<string[]>(initialData?.actions ?? []);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>(
    initialData?.capabilities ?? {}
  );
  const [roleMeta, setRoleMeta] = useState<RoleMeta | null>(
    initialData?.roleMeta ?? null
  );
  const [isLoading, setIsLoading] = useState(!initialData);
  const [impersonator, setImpersonator] = useState(initialData?.impersonator);

  const fetchUser = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/auth/me");
      if (response.ok) {
        const data: UserData = await response.json();
        setUser(data.user);
        setOrganization(data.organization);
        setActions(data.actions ?? []);
        setCapabilities(data.capabilities ?? {});
        setRoleMeta(data.roleMeta ?? null);
        setImpersonator(data.impersonator);
      } else {
        setUser(null);
        setOrganization(null);
        setActions([]);
        setCapabilities({});
        setRoleMeta(null);
        setImpersonator(undefined);
      }
    } catch (error) {
      log.error("fetch_user_failed", {}, error);
      setUser(null);
      setOrganization(null);
      setActions([]);
      setCapabilities({});
      setRoleMeta(null);
      setImpersonator(undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // The useState initializers above only see `initialData` as it was on the
  // very first render. The dashboard's session now STREAMS in, so on that
  // route it lands a beat later and those initializers have already run with
  // nothing — without this the seed is silently dropped and the hook reports a
  // signed-out, permanently-loading user.
  //
  // Depends on the individual fields, not `initialData`: the provider rebuilds
  // that wrapper every render, while the fields themselves are stable
  // references off the resolved seed.
  const seedUser = initialData?.user ?? null;
  const seedOrganization = initialData?.organization ?? null;
  const seedActions = initialData?.actions;
  const seedCapabilities = initialData?.capabilities;
  const seedRoleMeta = initialData?.roleMeta ?? null;
  const seedImpersonator = initialData?.impersonator;

  useEffect(() => {
    if (!seedUser) return;
    setUser(seedUser);
    setOrganization(seedOrganization);
    setRoleMeta(seedRoleMeta);
    setImpersonator(seedImpersonator);
    if (seedActions) setActions(seedActions);
    if (seedCapabilities) setCapabilities(seedCapabilities);
    setIsLoading(false);
  }, [
    seedUser,
    seedOrganization,
    seedActions,
    seedCapabilities,
    seedRoleMeta,
    seedImpersonator,
  ]);

  // Fall back to /api/auth/me when the server couldn't supply the full
  // picture: no initial data at all, no organization (its Convex query failed),
  // or no actions (nothing computed them).
  //
  // Deliberately a boolean rather than `initialData` itself. The provider
  // rebuilds that object on every render, so keying the effect on its identity
  // re-ran the fetch for each state update the fetch itself caused — an
  // unbounded request loop on exactly the degraded path this is meant to
  // rescue. A primitive only changes when the answer changes.
  const needsFallbackFetch =
    !deferFetch &&
    (!initialData || !initialData.organization || !initialData.actions);

  useEffect(() => {
    if (needsFallbackFetch) fetchUser();
  }, [needsFallbackFetch, fetchUser]);

  // Re-fetch auth state when active organization changes (cookie update)
  useEffect(() => {
    const handler = () => fetchUser();
    window.addEventListener("org-context-changed", handler);
    return () => window.removeEventListener("org-context-changed", handler);
  }, [fetchUser]);

  // Keep Sentry user attribution in sync with auth state
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email });
    } else {
      Sentry.setUser(null);
    }
  }, [user]);

  const signOutHandler = useCallback(async () => {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- /sign-out is a route handler that 302s to WorkOS logout; router.push() cannot leave the origin.
    window.location.href = "/sign-out";
  }, []);

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
    signOut: signOutHandler,
    refreshUser: fetchUser,
  };
}
