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
    api.variableRequests.listForProject,
    projectId && userId
      ? {
          projectId: projectId as Id<"projects">,
          userId: userId as Id<"users">,
        }
      : "skip"
  );

  return {
    requests: requests ?? [],
    isLoading: projectId && userId ? requests === undefined : false,
  };
}

/**
 * Resolve (approve/reject) a variable request directly via Convex.
 */
export function useResolveVariableRequest() {
  const review = useMutation(api.variableRequests.review);
  const cancel = useMutation(api.variableRequests.cancel);

  return {
    mutateAsync: async (data: {
      requestId: string;
      action: "approve" | "reject" | "cancel";
      reviewedBy: string;
      reviewReason?: string;
    }) => {
      if (data.action === "cancel") {
        const requestId = await cancel({
          requestId: data.requestId as Id<"environmentVariableRequests">,
          canceledBy: data.reviewedBy as Id<"users">,
        });
        return { requestId, status: "cancelled" };
      }

      const result = await review({
        requestId: data.requestId as Id<"environmentVariableRequests">,
        reviewedBy: data.reviewedBy as Id<"users">,
        action: data.action,
        reviewReason: data.reviewReason,
      });
      return result;
    },
  };
}
