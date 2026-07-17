"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/**
 * Account request hooks — mirror of useVariableRequests.ts for the
 * accountRequests flow (developers are read+request-only for shared accounts).
 */

/** List account requests for a project (real-time via Convex WebSocket). */
export function useAccountRequests(
  projectId: Id<"projects"> | string | undefined,
  userId: Id<"users"> | string | undefined
) {
  const requests = useQuery(
    api.features.accounts.requests.queries.listForProject,
    // Identity is derived server-side from the attached JWT; `userId` gates
    // the query until the current user is known (auth ready).
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
 * Pending account-request count for a project — powers the sidebar badge.
 * Same gating as useAccountRequests: skipped until identity is known.
 */
export function usePendingAccountRequestCount(
  projectId: Id<"projects"> | string | undefined,
  userId: Id<"users"> | string | undefined
) {
  const count = useQuery(
    api.features.accounts.requests.queries.pendingCountForProject,
    projectId && userId ? { projectId: projectId as Id<"projects"> } : "skip"
  );
  return count ?? 0;
}

/**
 * Submit an account request (developer path). Credentials travel to a Convex
 * action that encrypts them into WorkOS Vault before the request row is
 * created — Convex never stores plaintext.
 */
export function useCreateAccountRequest() {
  const createRequest = useAction(
    api.features.accounts.requests.actions.createWithCredentials
  );

  return {
    mutateAsync: (data: {
      projectId: string;
      name: string;
      websiteUrl?: string;
      username: string;
      password: string;
      description?: string;
      environments: string[];
    }) =>
      createRequest({
        projectId: data.projectId as Id<"projects">,
        name: data.name,
        websiteUrl: data.websiteUrl,
        username: data.username,
        password: data.password,
        description: data.description,
        environments: data.environments,
      }),
  };
}

/** Resolve (approve/reject/cancel) an account request directly via Convex. */
export function useResolveAccountRequest() {
  const review = useMutation(api.features.accounts.requests.mutations.review);
  const cancel = useMutation(api.features.accounts.requests.mutations.cancel);

  return {
    mutateAsync: async (data: {
      requestId: string;
      action: "approve" | "reject" | "cancel";
      reviewReason?: string;
    }) => {
      if (data.action === "cancel") {
        const requestId = await cancel({
          requestId: data.requestId as Id<"accountRequests">,
        });
        return { requestId, status: "cancelled" };
      }

      return review({
        requestId: data.requestId as Id<"accountRequests">,
        action: data.action,
        reviewReason: data.reviewReason,
      });
    },
  };
}
