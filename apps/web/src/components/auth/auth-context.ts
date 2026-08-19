"use client";

import { createContext, useContext } from "react";
import type { AuthUser, Organization, RoleMeta } from "@/lib/auth";

export interface AuthContextValue {
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
  hasOtherOrganizations: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
