"use client";

import { useEffect } from "react";
import Link from "next/link";
import { createLogger } from "@/lib/logger";

const log = createLogger("segment-error");

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

  // A segment boundary intercepts errors before the parent (dashboard)
  // error.tsx can log them — report here or they vanish from observability.
  useEffect(() => {
    log.error(
      "segment_error_boundary",
      { digest: error.digest, notFound: isNotFound },
      error
    );
  }, [error, isNotFound]);

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-line bg-surface/90">
        <div className="flex items-center gap-2 border-b border-line bg-surface-raised/80 px-4 py-2.5">
          <div className="h-3 w-3 rounded-full bg-danger/80" />
          <div className="h-3 w-3 rounded-full bg-warning/80" />
          <div className="h-3 w-3 rounded-full bg-accent/80" />
          <span className="ml-2 text-xs text-ink-subtle">error</span>
        </div>

        <div className="p-6 font-mono text-sm">
          <p className="text-danger">
            ERROR: {isNotFound ? notFoundTitle : genericTitle} [exit code 1]
          </p>
          <p className="mt-2 text-ink-muted">
            {isNotFound ? notFoundMessage : genericMessage}
          </p>

          {error.digest && (
            <p className="mt-3 text-xs text-ink-faint">
              Error ID: {error.digest}
            </p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => reset()}
              className="inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
            >
              Try Again
            </button>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink-muted"
            >
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
