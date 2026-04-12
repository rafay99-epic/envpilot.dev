"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import type { AuthUser, Organization } from "@/lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  organization: Organization | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  impersonator?: { email: string; reason: string | null };
  canDo: (action: string) => boolean;
  actions: string[];
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  initialUser?: AuthUser | null;
  initialOrganization?: Organization | null;
}

export function AuthProvider({
  children,
  initialUser,
  initialOrganization,
}: AuthProviderProps) {
  const auth = useAuth(
    initialUser
      ? {
          user: initialUser,
          organization: initialOrganization ?? null,
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
