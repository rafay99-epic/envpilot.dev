import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onGoToPage: (page: number) => void;
  startIndex: number;
  endIndex: number;
  totalItems: number;
}

export function Pagination({
  currentPage,
  totalPages,
  hasNextPage,
  hasPrevPage,
  onNextPage,
  onPrevPage,
  onGoToPage,
  startIndex,
  endIndex,
  totalItems,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageNumbers(currentPage, totalPages);

  return (
    <div className="flex items-center justify-between border-t border-line px-5 py-3">
      <span className="font-mono text-xs text-ink-subtle">
        showing {startIndex + 1}-{endIndex} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrevPage}
          disabled={!hasPrevPage}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-subtle"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((page, i) =>
          page === "..." ? (
            <span
              key={`ellipsis-${i}`}
              className="px-1 font-mono text-xs text-ink-faint"
            >
              ...
            </span>
          ) : (
            <button
              key={page}
              onClick={() => onGoToPage(page as number)}
              className={`min-w-7 rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                page === currentPage
                  ? "bg-accent-soft text-accent border border-accent-line"
                  : "text-ink-subtle hover:bg-surface-hover hover:text-ink-muted"
              }`}
            >
              {page}
            </button>
          )
        )}
        <button
          onClick={onNextPage}
          disabled={!hasNextPage}
          className="rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-accent disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-subtle"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "...")[] = [1];

  if (current > 3) {
    pages.push("...");
  }

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) {
    pages.push("...");
  }

  pages.push(total);

  return pages;
}
