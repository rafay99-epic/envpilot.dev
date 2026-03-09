"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for getting permissions on a variable
 */
export function useVariablePermissions(
  variableId: Id<"environmentVariables"> | undefined,
) {
  return useQuery(
    api.permissions.getForVariable,
    variableId ? { variableId } : "skip",
  );
}

/**
 * Hook for getting all active permissions for a user
 */
export function useUserPermissions(userId: Id<"users"> | undefined) {
  return useQuery(api.permissions.getForUser, userId ? { userId } : "skip");
}

/**
 * Hook for checking a specific permission
 */
export function useCheckPermission(
  variableId: Id<"environmentVariables"> | undefined,
  userId: Id<"users"> | undefined,
  requiredPermission: "read" | "write" | "admin",
) {
  return useQuery(
    api.permissions.checkPermission,
    variableId && userId ? { variableId, userId, requiredPermission } : "skip",
  );
}

/**
 * Hook for getting permission history
 */
export function usePermissionHistory(
  variableId: Id<"environmentVariables"> | undefined,
  limit?: number,
) {
  return useQuery(
    api.permissions.getHistory,
    variableId ? { variableId, limit } : "skip",
  );
}

/**
 * Hook for getting users with access to a project
 */
export function useUsersWithProjectAccess(
  projectId: Id<"projects"> | undefined,
) {
  return useQuery(
    api.permissions.getUsersWithProjectAccess,
    projectId ? { projectId } : "skip",
  );
}

/**
 * Hook for checking if user can manage variable permissions
 */
export function useCanManageVariablePermissions(
  variableId: Id<"environmentVariables"> | undefined,
  userId: Id<"users"> | undefined,
) {
  return useQuery(
    api.permissions.canManageVariablePermissions,
    variableId && userId ? { variableId, userId } : "skip",
  );
}

/**
 * Hook for getting assignable members for a variable
 */
export function useAssignableMembers(
  variableId: Id<"environmentVariables"> | undefined,
  requestingUserId: Id<"users"> | undefined,
) {
  return useQuery(
    api.permissions.getAssignableMembers,
    variableId && requestingUserId ? { variableId, requestingUserId } : "skip",
  );
}
