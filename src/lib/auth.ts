import {
  authkitMiddleware,
  withAuth,
  signOut,
} from "@workos-inc/authkit-nextjs";

// Re-export auth utilities for consistent imports
export { authkitMiddleware, withAuth, signOut };

// Types for user and session data
export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profilePictureUrl: string | null;
  organizationId: string | null;
  role: string | null;
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  tier?: "free" | "pro" | null;
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

// Permission constants for role-based access
export const PERMISSIONS = {
  // Organization-level permissions
  ORG_ADMIN: "org:admin",
  ORG_MEMBER: "org:member",

  // Project permissions
  PROJECT_CREATE: "project:create",
  PROJECT_READ: "project:read",
  PROJECT_UPDATE: "project:update",
  PROJECT_DELETE: "project:delete",

  // Variable permissions
  VARIABLE_CREATE: "variable:create",
  VARIABLE_READ: "variable:read",
  VARIABLE_UPDATE: "variable:update",
  VARIABLE_DELETE: "variable:delete",
  VARIABLE_ROLLBACK: "variable:rollback", // Admin only - restore previous versions
  VARIABLE_MANAGE_PERMISSIONS: "variable:manage_permissions", // Admin and Team Lead - grant/revoke variable access

  // Team permissions
  TEAM_INVITE: "team:invite",
  TEAM_REMOVE: "team:remove",
  TEAM_MANAGE_ROLES: "team:manage_roles",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type MembershipRole = "admin" | "team_lead" | "member";

// Role definitions with their associated permissions
export const ROLES = {
  ADMIN: {
    name: "Admin",
    description:
      "Full access to all features including team management and variable rollback",
    permissions: Object.values(PERMISSIONS), // Includes VARIABLE_ROLLBACK and VARIABLE_MANAGE_PERMISSIONS
  },
  TEAM_LEAD: {
    name: "Team Lead",
    description:
      "Can manage projects, variables, and grant/revoke variable access to team members",
    permissions: [
      PERMISSIONS.ORG_MEMBER,
      PERMISSIONS.PROJECT_CREATE,
      PERMISSIONS.PROJECT_READ,
      PERMISSIONS.PROJECT_UPDATE,
      PERMISSIONS.VARIABLE_CREATE,
      PERMISSIONS.VARIABLE_READ,
      PERMISSIONS.VARIABLE_UPDATE,
      PERMISSIONS.VARIABLE_DELETE,
      PERMISSIONS.VARIABLE_MANAGE_PERMISSIONS, // Team Leads can manage variable permissions
      PERMISSIONS.TEAM_INVITE,
    ],
  },
  MEMBER: {
    name: "Member",
    description:
      "Read-only access to projects. Variable access controlled by per-variable permissions",
    permissions: [
      PERMISSIONS.ORG_MEMBER,
      PERMISSIONS.PROJECT_READ,
      // VARIABLE_READ is NOT included - Members need explicit per-variable permissions
    ],
  },
} as const;

export type Role = keyof typeof ROLES;

const MEMBERSHIP_ROLE_TO_ROLE: Record<MembershipRole, Role> = {
  admin: "ADMIN",
  team_lead: "TEAM_LEAD",
  member: "MEMBER",
};

/**
 * Check if a user has a specific permission
 */
export function hasPermission(
  userPermissions: string[],
  requiredPermission: Permission,
): boolean {
  return userPermissions.includes(requiredPermission);
}

/**
 * Check if a user has all of the specified permissions
 */
export function hasAllPermissions(
  userPermissions: string[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.every((p) => userPermissions.includes(p));
}

/**
 * Check if a user has any of the specified permissions
 */
export function hasAnyPermission(
  userPermissions: string[],
  requiredPermissions: Permission[],
): boolean {
  return requiredPermissions.some((p) => userPermissions.includes(p));
}

/**
 * Get permissions for a role
 */
export function getPermissionsForRole(role: Role): Permission[] {
  return [...ROLES[role].permissions];
}

/**
 * Get permissions from Convex membership role (organization scoped)
 */
export function getPermissionsForMembershipRole(
  membershipRole: MembershipRole | null | undefined,
): Permission[] {
  if (!membershipRole) {
    return [...ROLES.MEMBER.permissions];
  }

  return [...ROLES[MEMBERSHIP_ROLE_TO_ROLE[membershipRole]].permissions];
}
