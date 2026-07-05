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
  return useQuery(api.organizations.listForUser, userId ? {} : "skip");
}

/**
 * Hook for getting a single organization by ID
 */
export function useOrganization(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.organizations.getById,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for getting organization members
 */
export function useOrganizationMembers(
  organizationId: Id<"organizations"> | undefined
) {
  return useQuery(
    api.organizations.getMembers,
    organizationId ? { organizationId } : "skip"
  );
}
