"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useReducer, useRef } from "react";

const MAX_AUTO_RETRIES = 2;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retryCount = useRef(0);
  const [retriesExhausted, markExhausted] = useReducer(() => true, false);

  useEffect(() => {
    console.error("Application error:", error);

    // Auto-retry transient errors (502, network failures) up to MAX_AUTO_RETRIES times
    if (retryCount.current < MAX_AUTO_RETRIES) {
      retryCount.current += 1;
      const delay = retryCount.current * 1000;
      const timer = setTimeout(() => reset(), delay);
      return () => clearTimeout(timer);
    }

    // All retries exhausted — report to Sentry and show error UI
    Sentry.captureException(error);
    const timer = setTimeout(() => markExhausted(), 0);
    return () => clearTimeout(timer);
  }, [error, reset]);

  if (!retriesExhausted) {
    // Show a minimal loading state while auto-retrying
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0f172a]">
        <div className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> retrying...
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0f172a] px-4">
      {/* Grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(34,197,94,1) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90 shadow-2xl">
        {/* Terminal header */}
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
          <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
          <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
          <span className="ml-2 text-xs text-zinc-500">error</span>
        </div>

        <div className="p-8 font-mono text-sm">
          <p className="text-red-400">
            ERROR: Something went wrong [exit code 1]
          </p>
          <p className="mt-2 text-zinc-400">
            An unexpected error occurred. Please try again or contact support if
            the problem persists.
          </p>

          {error.digest && (
            <p className="mt-4 text-xs text-zinc-600">
              Error ID: {error.digest}
            </p>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            >
              Go Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
