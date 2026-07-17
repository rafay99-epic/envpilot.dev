"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { AuthUser, Organization, RoleMeta } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonator?: { email: string; reason: string | null };
  canDo: (action: string) => boolean;
  actions: string[];
  /** Registry capability map for the active org role. */
  capabilities: Record<string, boolean>;
  /** Registry display metadata for the active org role. */
  roleMeta: RoleMeta | null;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
  initialOrganization?: Organization | null;
  /** Backend-authz actions computed by the server layout. When present
   *  (together with an organization), use-auth skips its mount-time
   *  /api/auth/me refetch entirely. */
  initialActions?: string[];
  /** Registry capability map computed alongside initialActions. */
  initialCapabilities?: Record<string, boolean>;
  /** Registry role metadata computed alongside initialActions. */
  initialRoleMeta?: RoleMeta | null;
}

export function AuthProvider({
  children,
  initialUser,
  initialOrganization,
  initialActions,
  initialCapabilities,
  initialRoleMeta,
}: AuthProviderProps) {
  const auth = useAuth(
    initialUser
      ? {
          user: initialUser,
          organization: initialOrganization ?? null,
          actions: initialActions,
          capabilities: initialCapabilities,
          roleMeta: initialRoleMeta,
          accessToken: null,
        }
      : undefined
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
