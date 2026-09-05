"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import { useConvexAuthFromWorkOS } from "@/hooks/use-convex-workos-auth";
import {
  QueryClient,
  QueryClientProvider,
  QueryCache,
  MutationCache,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ReactNode } from "react";
import * as Sentry from "@sentry/nextjs";
import { Toaster, toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import {
  sanitizeConvexError,
  isTierLimitError,
  isAuthorizationError,
  isConflictError,
} from "@/lib/error-messages";

function convexLogArgsToMessage(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.message;
      try {
        // JSON.stringify throws on circular refs/BigInt and returns
        // undefined for undefined/functions — never let the reporting
        // path itself throw.
        return JSON.stringify(a) ?? String(a);
      } catch {
        return String(a);
      }
    })
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
    const message = convexLogArgsToMessage(args);
    // Only mutation/action failures get a toast — the request manager tags
    // them "[CONVEX M(...)]" / "[CONVEX A(...)]". Other logger noise
    // (connection chatter etc.) is reported but not shown to the user.
    const isFunctionFailure = /\[CONVEX [MA]\(/.test(message);
    const friendly = sanitizeConvexError(message);

    // Tier-limit and authorization failures are expected conditions
    // (mirrors the server-side triage in @/lib/api-errors) — tell the USER
    // what happened, but breadcrumb-only for Sentry so they don't alert.
    // "Unauthenticated: no verified user identity" is the transient
    // token-propagation race (a query fired before the WorkOS JWT attached
    // to the socket) — it self-heals on reconnect and AuthErrorBoundary
    // auto-retries past it, so treat it the same way.
    const isTransientAuthRace =
      /unauthenticated: no verified user identity/i.test(message);
    const isRateLimited = /"kind":\s*"RateLimited"/.test(message);

    // Console severity matches the classification above: the self-healing
    // token-propagation race is expected auth-handshake behavior, not an
    // app error — warn, don't error (a genuinely stuck auth still fails
    // loudly through AuthErrorBoundary and the queries never resolving).
    if (isTransientAuthRace) {
      console.warn(...args);
    } else {
      console.error(...args);
    }
    if (
      isTierLimitError(friendly) ||
      isAuthorizationError(friendly) ||
      isConflictError(friendly) ||
      isTransientAuthRace ||
      isRateLimited
    ) {
      if (isFunctionFailure) {
        // Dedupe by message: a re-clicked failing action updates the
        // existing toast instead of stacking.
        toast.warning(friendly, { id: friendly });
      }
      Sentry.addBreadcrumb({
        category: "convex",
        message,
        level: "error",
      });
      return;
    }
    if (isFunctionFailure) {
      toast.error("Something went wrong", {
        id: friendly,
        description: friendly,
      });
    }
    Sentry.captureMessage(message, {
      level: "error",
      tags: { source: "convex-client" },
    });
  },
};

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
  // ApiErrors are expected server responses whose call sites own the UX
  // (forms show them inline) — no global toast, no client-side Sentry.
  if (error instanceof ApiError) return;

  // A non-ApiError here is a bug (queryFn/mutationFn threw). Nothing else
  // will tell the user for mutations — queries retry/rerender, so only
  // mutation bugs get the toast.
  if (context.type === "mutation") {
    const friendly = sanitizeConvexError(error);
    toast.error("Something went wrong", {
      id: friendly,
      description: friendly,
    });
  }

  // Convex function failures already reach Sentry exactly once through
  // convexLogger.error above (the request manager routes EVERY failure
  // there) — capturing here again files a twin issue titled
  // "Error: [CONVEX ...]" for the same event (ENVPILOT-Y/X, W/V).
  if (/\[CONVEX (?:[MAQ]\(|FATAL)/.test(error.message)) {
    return;
  }

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
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

/**
 * AuthKitProvider owns the WorkOS session/token state (server-action backed);
 * ConvexProviderWithAuth attaches the AuthKit JWT to the Convex WebSocket so
 * every query/mutation runs with a server-verified identity
 * (convex/auth.config.ts + ctx.auth.getUserIdentity()).
 */
function ConvexBoundaryProvider({ children }: { children: ReactNode }) {
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useConvexAuthFromWorkOS}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
