"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // This boundary is the end of the line for the error — log it or it
  // disappears. removeConsole keeps console.error in production builds.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 text-center font-mono">
      <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-danger-line bg-danger-soft text-danger">
        <AlertTriangle aria-hidden className="h-6 w-6" />
      </span>
      <p className="mt-6 text-sm text-ink-muted">
        Something went wrong loading this page.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-ink-faint">Error ID: {error.digest}</p>
      )}
      <button
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-accent-line bg-accent-soft px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent-soft"
      >
        Try again
      </button>
    </div>
  );
}
