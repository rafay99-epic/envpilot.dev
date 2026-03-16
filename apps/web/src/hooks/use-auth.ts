"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthUser, Organization, Permission } from "@/lib/auth";
import { hasPermission, hasAllPermissions, hasAnyPermission } from "@/lib/auth";

interface UserData {
  user: AuthUser | null;
  organization: Organization | null;
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
  hasPermission: (permission: Permission) => boolean;
  hasAllPermissions: (permissions: Permission[]) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
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
        setImpersonator(data.impersonator);
      } else {
        setUser(null);
        setOrganization(null);
        setImpersonator(undefined);
      }
    } catch {
      setUser(null);
      setOrganization(null);
      setImpersonator(undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch if no initial data, or if initial data has no organization
    // (e.g. server-side Convex query failed during layout render)
    if (!initialData || !initialData.organization) {
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

  const userPermissions = user?.permissions ?? [];

  return {
    user,
    organization,
    isLoading,
    isAuthenticated: !!user,
    isImpersonating: !!impersonator,
    impersonator,
    hasPermission: (permission: Permission) =>
      hasPermission(userPermissions, permission),
    hasAllPermissions: (permissions: Permission[]) =>
      hasAllPermissions(userPermissions, permissions),
    hasAnyPermission: (permissions: Permission[]) =>
      hasAnyPermission(userPermissions, permissions),
    signOut: signOutHandler,
    refreshUser: fetchUser,
  };
}
