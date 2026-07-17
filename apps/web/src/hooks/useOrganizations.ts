"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

/**
 * Hook for listing organizations for the current user
 */
export function useUserOrganizations(userId: Id<"users"> | undefined) {
  // Identity is derived server-side from the attached JWT; `userId` gates the
  // query until the current user is known (auth ready).
  return useQuery(
    api.features.organizations.queries.listForUser,
    userId ? {} : "skip"
  );
}

/**
 * Hook for getting a single organization by ID
 */
export function useOrganization(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.features.organizations.queries.getById,
    organizationId ? { organizationId } : "skip"
  );
}

/** A registry role the caller may assign — see listAssignableRoles. */
export interface AssignableRole {
  slug: string;
  displayName: string;
  description: string;
  color: string;
  level: number;
  envScoped: boolean;
}

/**
 * Registry roles the current user may assign in this org (invite / role
 * change pickers). Sorted by level desc, strictly below the caller's own
 * level (owner class sees all). undefined while loading.
 */
export function useAssignableRoles(
  organizationId: Id<"organizations"> | string | undefined
): AssignableRole[] | undefined {
  return useQuery(
    api.features.organizations.roleOptions.listAssignableRoles,
    organizationId
      ? { organizationId: organizationId as Id<"organizations"> }
      : "skip"
  );
}

/**
 * Hook for getting organization members
 */
export function useOrganizationMembers(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.features.organizations.queries.getMembers,
    organizationId ? { organizationId } : "skip"
  );
}
