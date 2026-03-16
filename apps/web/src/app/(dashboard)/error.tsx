"use client";

import { useEffect, useRef, useState } from "react";

const MAX_AUTO_RETRIES = 2;

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const retryCount = useRef(0);
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    console.error("Dashboard error:", error);

    // Auto-retry transient errors (e.g. 502 during org switch) before showing UI
    if (retryCount.current < MAX_AUTO_RETRIES) {
      retryCount.current += 1;
      const delay = retryCount.current * 1000;
      const timer = setTimeout(() => reset(), delay);
      return () => clearTimeout(timer);
    }

    setShowError(true);
  }, [error, reset]);

  if (!showError) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> retrying...
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-zinc-700/50 bg-zinc-900/90">
        <div className="flex items-center gap-2 border-b border-zinc-700/50 bg-zinc-800/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-[#ef5350]/80" />
          <div className="h-3 w-3 rounded-full bg-[#fbbf24]/80" />
          <div className="h-3 w-3 rounded-full bg-[#22c55e]/80" />
          <span className="ml-2 text-xs text-zinc-500">error</span>
        </div>

        <div className="p-6 font-mono text-sm">
          <p className="text-red-400">
            ERROR: Failed to load page [exit code 1]
          </p>
          <p className="mt-2 text-zinc-400">
            There was an error loading this page. Please try again.
          </p>

          {error.digest && (
            <p className="mt-3 text-xs text-zinc-600">
              Error ID: {error.digest}
            </p>
          )}

          <button
            onClick={() => reset()}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
          >
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
}
