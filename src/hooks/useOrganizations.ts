"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Hook for listing organizations for the current user
 */
export function useUserOrganizations(userId: Id<"users"> | undefined) {
  return useQuery(
    api.organizations.listForUser,
    userId ? { userId } : "skip"
  );
}

/**
 * Hook for getting a single organization by ID
 */
export function useOrganization(organizationId: Id<"organizations"> | undefined) {
  return useQuery(
    api.organizations.getById,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for getting organization members
 */
export function useOrganizationMembers(organizationId: Id<"organizations"> | undefined) {
  return useQuery(
    api.organizations.getMembers,
    organizationId ? { organizationId } : "skip"
  );
}

/**
 * Hook for organization mutations
 */
export function useOrganizationMutations() {
  const createOrganization = useMutation(api.organizations.create);
  const updateOrganization = useMutation(api.organizations.update);
  const deleteOrganization = useMutation(api.organizations.remove);
  const addMember = useMutation(api.organizations.addMember);
  const removeMember = useMutation(api.organizations.removeMember);
  const updateMemberRole = useMutation(api.organizations.updateMemberRole);
  const updateTier = useMutation(api.organizations.updateTier);

  return {
    createOrganization,
    updateOrganization,
    deleteOrganization,
    addMember,
    removeMember,
    updateMemberRole,
    updateTier,
  };
}
