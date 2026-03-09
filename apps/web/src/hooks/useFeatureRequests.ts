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
  return useQuery(api.featureRequests.listPublic, {
    status,
    category,
  });
}

/**
 * Hook for getting planned/in-progress/completed features (roadmap view)
 */
export function usePlannedFeatures() {
  return useQuery(api.featureRequests.listPlanned, {});
}

/**
 * Hook for getting a single feature request
 */
export function useFeatureRequest(
  featureRequestId: Id<"featureRequests"> | undefined
) {
  return useQuery(
    api.featureRequests.getById,
    featureRequestId ? { featureRequestId } : "skip"
  );
}

/**
 * Hook for getting all categories
 */
export function useFeatureCategories() {
  return useQuery(api.featureRequests.listCategories, {});
}

/**
 * Hook to check if a user has voted for a feature
 */
export function useHasVoted(
  featureRequestId: Id<"featureRequests"> | undefined,
  userId?: Id<"users">,
  voterEmail?: string
) {
  return useQuery(
    api.featureRequests.hasVoted,
    featureRequestId ? { featureRequestId, userId, voterEmail } : "skip"
  );
}

/**
 * Hook for public feature request mutations (submit, vote, unvote)
 */
export function useFeatureRequestMutations() {
  const submit = useMutation(api.featureRequests.submit);
  const vote = useMutation(api.featureRequests.vote);
  const unvote = useMutation(api.featureRequests.unvote);

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
  const updateStatus = useMutation(api.featureRequests.updateStatus);
  const update = useMutation(api.featureRequests.update);
  const remove = useMutation(api.featureRequests.remove);

  return {
    updateStatus,
    update,
    remove,
  };
}
