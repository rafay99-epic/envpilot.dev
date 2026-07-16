"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * List variable requests for a project (real-time via Convex WebSocket).
 */
export function useVariableRequests(
  projectId: Id<"projects"> | string | undefined,
  userId: Id<"users"> | string | undefined
) {
  const requests = useQuery(
    api.features.variables.requests.queries.listForProject,
    // Identity is derived server-side from the attached JWT; `userId` gates the
    // query until the current user is known (auth ready).
    projectId && userId
      ? {
          projectId: projectId as Id<"projects">,
        }
      : "skip"
  );

  return {
    requests: requests ?? [],
    isLoading: projectId && userId ? requests === undefined : false,
  };
}

/**
 * Pending request count for a project — powers the sidebar badge. Same
 * gating as useVariableRequests: skipped until identity is known.
 */
export function usePendingRequestCount(
  projectId: Id<"projects"> | string | undefined,
  userId: Id<"users"> | string | undefined
) {
  const count = useQuery(
    api.features.variables.requests.queries.pendingCountForProject,
    projectId && userId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
  return count ?? 0;
}

/**
 * Resolve (approve/reject) a variable request directly via Convex.
 */
export function useResolveVariableRequest() {
  const review = useMutation(api.features.variables.requests.mutations.review);
  const cancel = useMutation(api.features.variables.requests.mutations.cancel);

  return {
    mutateAsync: async (data: {
      requestId: string;
      action: "approve" | "reject" | "cancel";
      reviewedBy: string;
      reviewReason?: string;
      /** Reviewer's environment override — approve only. */
      environments?: string[];
    }) => {
      if (data.action === "cancel") {
        const requestId = await cancel({
          requestId: data.requestId as Id<"environmentVariableRequests">,
        });
        return { requestId, status: "cancelled" };
      }

      const result = await review({
        requestId: data.requestId as Id<"environmentVariableRequests">,
        action: data.action,
        reviewReason: data.reviewReason,
        environments: data.action === "approve" ? data.environments : undefined,
      });
      return result;
    },
  };
}
