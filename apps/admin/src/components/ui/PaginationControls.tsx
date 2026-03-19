import { Button } from "./Button";
import { Spinner } from "./Spinner";

interface PaginationControlsProps {
  status: "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";
  loadMore: (numItems: number) => void;
  numItems?: number;
  loadedCount: number;
}

export function PaginationControls({
  status,
  loadMore,
  numItems = 50,
  loadedCount,
}: PaginationControlsProps) {
  if (status === "LoadingFirstPage") {
    return <Spinner />;
  }

  return (
    <div className="flex items-center justify-between border-t border-zinc-800 px-1 py-3">
      <p className="text-xs text-zinc-500">
        {loadedCount} rows loaded
        {status === "Exhausted" && " (all loaded)"}
      </p>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadMore(numItems)}
          disabled={status === "LoadingMore"}
        >
          {status === "LoadingMore" ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-500" />
              Loading...
            </>
          ) : (
            `Load ${numItems} more`
          )}
        </Button>
      )}
    </div>
  );
}
