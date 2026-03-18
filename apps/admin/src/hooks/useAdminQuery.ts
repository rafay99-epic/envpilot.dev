import { useQuery, useMutation } from "convex/react";
import { useAuthStore } from "@/stores/auth-store";
import type { FunctionReference, FunctionArgs, FunctionReturnType } from "convex/server";

export function useAdminQuery<F extends FunctionReference<"query">>(
  query: F,
  args: Omit<FunctionArgs<F>, "secret"> | "skip"
): FunctionReturnType<F> | undefined {
  const secret = useAuthStore((s) => s.secret);
  const shouldSkip = !secret || args === "skip";
  const queryArgs = (
    shouldSkip ? "skip" : { ...args, secret }
  ) as FunctionArgs<F> | "skip";
  return useQuery(query, queryArgs) as FunctionReturnType<F> | undefined;
}

export function useAdminMutation<F extends FunctionReference<"mutation">>(
  mutation: F
) {
  const secret = useAuthStore((s) => s.secret);
  const mutate = useMutation(mutation);
  return (args: Omit<FunctionArgs<F>, "secret">) => {
    if (!secret) throw new Error("Not authenticated");
    return mutate({ ...args, secret } as FunctionArgs<F>);
  };
}
