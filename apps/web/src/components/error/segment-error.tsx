"use client";

import Link from "next/link";

/**
 * Shared terminal-styled error card for route-segment error boundaries.
 * Each segment's error.tsx supplies the copy and the pattern that
 * distinguishes "not found / no access" from a transient failure.
 */
export function SegmentError({
  error,
  reset,
  notFoundPattern,
  notFoundTitle,
  notFoundMessage,
  genericTitle,
  genericMessage,
  backHref,
  backLabel,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  /** Bare-substring match against error.message — keep fragments specific. */
  notFoundPattern: RegExp;
  notFoundTitle: string;
  notFoundMessage: string;
  genericTitle: string;
  genericMessage: string;
  backHref: string;
  backLabel: string;
}) {
  const isNotFound = notFoundPattern.test(error.message);

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
            ERROR: {isNotFound ? notFoundTitle : genericTitle} [exit code 1]
          </p>
          <p className="mt-2 text-zinc-400">
            {isNotFound ? notFoundMessage : genericMessage}
          </p>

          {error.digest && (
            <p className="mt-3 text-xs text-zinc-600">
              Error ID: {error.digest}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2 text-sm font-medium text-green-400 transition-colors hover:bg-green-500/20"
            >
              Try Again
            </button>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            >
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
