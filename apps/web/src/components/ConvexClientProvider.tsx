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

function convexLogArgsToMessage(args: unknown[]): string {
  return args
    .map((a) =>
      typeof a === "string"
        ? a
        : a instanceof Error
          ? a.message
          : JSON.stringify(a)
    )
    .join(" ")
    .slice(0, 1000);
}

/**
 * Custom Convex client logger. The Convex request manager routes EVERY
 * mutation/action failure through logger.error() regardless of whether the
 * call site .catch()es the returned promise — this is the only blanket hook
 * for the raw convex/react useMutation call sites that have no local catch.
 * Query failures do NOT pass through here; they throw into React render and
 * are reported by the error.tsx boundaries.
 */
const convexLogger = {
  logVerbose() {},
  log(...args: unknown[]) {
    console.log(...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
    Sentry.addBreadcrumb({
      category: "convex",
      message: convexLogArgsToMessage(args),
      level: "warning",
    });
  },
  error(...args: unknown[]) {
    console.error(...args);
    const message = convexLogArgsToMessage(args);
    // Tier-limit and authorization failures are expected conditions
    // (mirrors the server-side triage in @/lib/api-errors) — breadcrumb
    // only, so they add context without becoming alertable issues.
    if (EXPECTED_CONVEX_ERROR.test(message)) {
      Sentry.addBreadcrumb({
        category: "convex",
        message,
        level: "error",
      });
      return;
    }
    Sentry.captureMessage(message, {
      level: "error",
      tags: { source: "convex-client" },
    });
  },
};

const EXPECTED_CONVEX_ERROR =
  /limit reached|Upgrade to Pro|Insufficient permissions|Not a member of this organization|No access to this project|Insufficient project permissions/;

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, {
  logger: convexLogger,
  // Experimental Convex hook for abnormal WebSocket closes. Message shape is
  // unstable, so treat as a warning-level signal, not an alertable issue.
  onServerDisconnectError: (message) => {
    Sentry.captureMessage(message, {
      level: "warning",
      tags: { source: "convex-ws" },
    });
  },
});

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
      <ConvexBoundaryProvider>{children}</ConvexBoundaryProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export function ConvexBoundaryProvider({ children }: { children: ReactNode }) {
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
