"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

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
 * Hook for getting all categories
 */
export function useFeatureCategories() {
  return useQuery(
    api.features.community.featureRequests.queries.listCategories,
    {}
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
