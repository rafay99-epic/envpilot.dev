"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthUser, Organization } from "@/lib/auth";
import { createLogger } from "@/lib/logger";

const log = createLogger("hooks/use-auth");

interface UserData {
  user: AuthUser | null;
  organization: Organization | null;
  actions?: string[];
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
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

/**
 * Client-side hook for accessing auth state
 * Note: For server components, use getUser() directly from @workos-inc/authkit-nextjs
 */
export function useAuth(initialData?: UserData): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(initialData?.user ?? null);
  const [organization, setOrganization] = useState<Organization | null>(
    initialData?.organization ?? null
  );
  const [actions, setActions] = useState<string[]>(initialData?.actions ?? []);
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
        setImpersonator(data.impersonator);
      } else {
        setUser(null);
        setOrganization(null);
        setActions([]);
        setImpersonator(undefined);
      }
    } catch (error) {
      log.error("fetch_user_failed", {}, error);
      setUser(null);
      setOrganization(null);
      setActions([]);
      setImpersonator(undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch if no initial data, if initial data has no organization
    // (e.g. server-side Convex query failed during layout render),
    // or if initial data has no actions (server layout doesn't compute them).
    if (!initialData || !initialData.organization || !initialData.actions) {
      fetchUser();
    }
  }, [initialData, fetchUser]);

  // Re-fetch auth state when active organization changes (cookie update)
  useEffect(() => {
    const handler = () => fetchUser();
    window.addEventListener("org-context-changed", handler);
    return () => window.removeEventListener("org-context-changed", handler);
  }, [fetchUser]);

  const signOutHandler = useCallback(async () => {
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
    signOut: signOutHandler,
    refreshUser: fetchUser,
  };
}
