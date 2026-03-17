"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { ApiError } from "@/lib/api-client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Global TanStack Query error handler.
 *
 * ApiError instances are expected (server returned a known error) —
 * the server-side handleApiError already reports 500s to Sentry.
 * Network/parse ApiErrors (status 0) are already captured in api-client.ts.
 *
 * We only capture truly unexpected errors here (non-ApiError exceptions
 * that slip through — e.g., a bug in a queryFn or mutationFn).
 */
function handleGlobalQueryError(
  error: Error,
  context: { type: "query" | "mutation"; key: readonly unknown[] }
) {
  if (error instanceof ApiError) return;

  Sentry.captureException(error, {
    tags: { source: "tanstack-query", type: context.type },
    extra: { queryKey: context.key },
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        // Don't retry 4xx errors (auth, validation, not found)
        if (
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) {
          return false;
        }
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      handleGlobalQueryError(error, { type: "query", key: query.queryKey });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      handleGlobalQueryError(error, {
        type: "mutation",
        key: mutation.options.mutationKey ?? ["unknown"],
      });
    },
  }),
});

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ConvexProvider client={convex}>{children}</ConvexProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
