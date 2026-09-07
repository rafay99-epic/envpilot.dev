"use client";

import Link from "next/link";

// Shown in place of the project page when the slug resolves to nothing.
export function ProjectNotFound({ error }: { error: Error | null }) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="rounded-full p-3 bg-danger-soft">
        <svg
          className="h-6 w-6 text-danger"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <h2 className="mt-4 text-lg font-semibold text-ink">
        {error instanceof Error ? error.message : "Project not found"}
      </h2>
      <Link
        href="/dashboard/projects"
        className="mt-6 text-sm font-medium text-ink hover:text-ink-muted"
      >
        Back to Projects
      </Link>
    </div>
  );
}
