"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";

type FeatureStatus =
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "declined";

/**
 * Hook for listing all public feature requests
 */
export function useFeatureRequests(status?: FeatureStatus, category?: string) {
  return useQuery(api.features.community.featureRequests.queries.listPublic, {
    status,
    category,
  });
}

/**
 * Hook for getting planned/in-progress/completed features (roadmap view)
 */
export function usePlannedFeatures() {
  return useQuery(
    api.features.community.featureRequests.queries.listPlanned,
    {}
  );
}

/**
 * Hook for getting a single feature request
 */
export function useFeatureRequest(
  featureRequestId: Id<"featureRequests"> | undefined
) {
  return useQuery(
    api.features.community.featureRequests.queries.getById,
    featureRequestId ? { featureRequestId } : "skip"
  );
}

/**
 * Hook for getting all categories
 */
export function useFeatureCategories() {
  return useQuery(
    api.features.community.featureRequests.queries.listCategories,
    {}
  );
}

/**
 * Hook to check if a user has voted for a feature
 */
export function useHasVoted(
  featureRequestId: Id<"featureRequests"> | undefined,
  _userId?: Id<"users">,
  voterEmail?: string
) {
  // Identity (for signed-in voters) is derived server-side from the attached
  // JWT; only the anonymous `voterEmail` fallback is still passed.
  return useQuery(
    api.features.community.featureRequests.queries.hasVoted,
    featureRequestId ? { featureRequestId, voterEmail } : "skip"
  );
}

/**
 * Hook for public feature request mutations (submit, vote, unvote)
 */
export function useFeatureRequestMutations() {
  const submit = useMutation(
    api.features.community.featureRequests.mutations.submit
  );
  const vote = useMutation(
    api.features.community.featureRequests.mutations.vote
  );
  const unvote = useMutation(
    api.features.community.featureRequests.mutations.unvote
  );

  return {
    submit,
    vote,
    unvote,
  };
}

/**
 * Hook for admin feature request mutations
 * These require admin privileges on the server-side
 */
export function useAdminFeatureRequestMutations() {
  const updateStatus = useMutation(
    api.features.community.featureRequests.mutations.updateStatus
  );
  const update = useMutation(
    api.features.community.featureRequests.mutations.update
  );
  const remove = useMutation(
    api.features.community.featureRequests.mutations.remove
  );

  return {
    updateStatus,
    update,
    remove,
  };
}
