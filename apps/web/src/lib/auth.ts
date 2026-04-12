import {
  authkitMiddleware,
  withAuth,
  signOut,
} from "@workos-inc/authkit-nextjs";

// Re-export auth utilities for consistent imports
export { authkitMiddleware, withAuth, signOut };

// ─── Types ────────────────────────────────────────────────────────────────────
// These types are used for data modeling and API response shapes.
// Authorization logic lives in convex/authz.ts (ORG_ACTIONS, PROJECT_ACTIONS).
// The /api/auth/me endpoint returns an `actions[]` array computed from that
// module, and the useAuth() hook exposes `canDo(action)` to check them.

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  organizationId: string | null;
  role: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  tier?: string | null;
  role?: MembershipRole | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthSession {
  user: AuthUser | null;
  organization: Organization | null;
  accessToken: string | null;
  refreshToken: string | null;
  impersonator?: {
    email: string;
    reason: string | null;
  };
}

export type MembershipRole = "admin" | "team_lead" | "member";
export type ProjectRole = "viewer" | "developer" | "manager";
