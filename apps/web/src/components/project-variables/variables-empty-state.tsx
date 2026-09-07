"use client";

// Placeholder shown when the project has no variables, or none match a search.
export function VariablesEmptyState({
  isSearching,
  searchTerm,
  canCreateVariable,
}: {
  isSearching: boolean;
  searchTerm: string;
  canCreateVariable: boolean;
}) {
  return (
    <div className="px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
        <svg
          className="h-6 w-6 text-ink-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
          />
        </svg>
      </div>
      <h3 className="mt-4 text-sm font-semibold text-ink">
        {isSearching ? "No matching variables" : "No variables yet"}
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        {isSearching
          ? `No variables match "${searchTerm}". Try a different term.`
          : canCreateVariable
            ? "Add your first environment variable to get started."
            : "No variables available for this environment."}
      </p>
    </div>
  );
}
