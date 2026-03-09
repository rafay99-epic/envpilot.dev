"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

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
