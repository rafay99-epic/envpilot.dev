"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for getting permissions on a variable
 */
export function useVariablePermissions(
  variableId: Id<"environmentVariables"> | undefined
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries.getForVariable,
    variableId ? { variableId } : "skip"
  );
}

/**
 * Hook for getting all active permissions for a user
 */
export function useUserPermissions(userId: Id<"users"> | undefined) {
  // Identity is derived server-side from the attached JWT; `userId` gates the
  // query until the current user is known (auth ready).
  return useQuery(
    api.features.permissions.variablePermissions.queries.getForUser,
    userId ? {} : "skip"
  );
}

/**
 * Hook for checking a specific permission
 */
export function useCheckPermission(
  variableId: Id<"environmentVariables"> | undefined,
  userId: Id<"users"> | undefined,
  requiredPermission: "read" | "write"
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries.checkPermission,
    variableId && userId ? { variableId, requiredPermission } : "skip"
  );
}

/**
 * Hook for getting permission history
 */
export function usePermissionHistory(
  variableId: Id<"environmentVariables"> | undefined,
  limit?: number
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries.getHistory,
    variableId ? { variableId, limit } : "skip"
  );
}

/**
 * Hook for getting users with access to a project
 */
export function useUsersWithProjectAccess(
  projectId: Id<"projects"> | undefined
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries
      .getUsersWithProjectAccess,
    projectId ? { projectId } : "skip"
  );
}

/**
 * Hook for checking if user can manage variable permissions
 */
export function useCanManageVariablePermissions(
  variableId: Id<"environmentVariables"> | undefined,
  userId: Id<"users"> | undefined
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries
      .canManageVariablePermissions,
    variableId && userId ? { variableId } : "skip"
  );
}

/**
 * Hook for getting assignable members for a variable
 */
export function useAssignableMembers(
  variableId: Id<"environmentVariables"> | undefined,
  requestingUserId: Id<"users"> | undefined
) {
  return useQuery(
    api.features.permissions.variablePermissions.queries.getAssignableMembers,
    variableId && requestingUserId ? { variableId } : "skip"
  );
}
