import {
  useQuery,
  usePaginatedQuery,
  useMutation,
  useAction,
  useConvexAuth,
} from "convex/react";
import type { FunctionReference, FunctionArgs } from "convex/server";

/**
 * Thin wrappers kept for one reason: queries must skip until the WorkOS JWT
 * is attached to the Convex client, or they'd fire unauthenticated and throw.
 * Mutations/actions need no gating (they're user-triggered after load).
 */
export function useAdminQuery<F extends FunctionReference<"query">>(
  query: F,
  args: FunctionArgs<F> | "skip"
) {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(query, isAuthenticated ? args : "skip");
}

export function useAdminPaginatedQuery<F extends FunctionReference<"query">>(
  queryRef: F,
  args: Omit<FunctionArgs<F>, "paginationOpts"> | "skip",
  options: { initialNumItems: number }
) {
  const { isAuthenticated } = useConvexAuth();
  return usePaginatedQuery(
    queryRef,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (isAuthenticated ? args : "skip") as any,
    options
  );
}

export const useAdminMutation = useMutation;
export const useAdminAction = useAction;
