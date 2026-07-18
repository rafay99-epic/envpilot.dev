import { Fragment, useState } from "react";
import { ChevronUp, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";
import { EmptyState } from "./EmptyState";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
  /** When set, rows become expandable and this renders the expanded panel. */
  renderExpanded?: (row: T) => React.ReactNode;
  /** Controlled expanded row id. Omit for uncontrolled behavior. */
  expandedId?: string | null;
  onExpandedChange?: (id: string | null) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading,
  emptyMessage = "No data found",
  onRowClick,
  rowKey,
  renderExpanded,
  expandedId,
  onExpandedChange,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [internalExpanded, setInternalExpanded] = useState<string | null>(null);

  const isControlled = expandedId !== undefined;
  const currentExpanded = isControlled ? expandedId : internalExpanded;

  if (isLoading) return <Spinner />;
  if (!data || data.length === 0) return <EmptyState title={emptyMessage} />;

  const sorted = sortKey
    ? [...data].sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
    : data;

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const toggleExpanded = (id: string) => {
    const next = currentExpanded === id ? null : id;
    if (isControlled) onExpandedChange?.(next);
    else setInternalExpanded(next);
  };

  const totalCols = columns.length + (renderExpanded ? 1 : 0);
  const clickable = Boolean(onRowClick || renderExpanded);

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700/50">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-zinc-800/50 bg-zinc-900/50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 font-mono text-[0.68rem] font-medium uppercase tracking-wider text-zinc-500",
                  col.sortable &&
                    "cursor-pointer select-none hover:text-zinc-300",
                  col.className
                )}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable &&
                    sortKey === col.key &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    ))}
                </span>
              </th>
            ))}
            {renderExpanded && <th className="w-10 px-4 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {sorted.map((row, i) => {
            const id = rowKey ? rowKey(row) : String(i);
            const isExpanded = renderExpanded != null && currentExpanded === id;
            return (
              <Fragment key={id}>
                <tr
                  className={cn(
                    "transition-colors hover:bg-green-500/5",
                    clickable && "cursor-pointer"
                  )}
                  onClick={() => {
                    if (renderExpanded) toggleExpanded(id);
                    onRowClick?.(row);
                  }}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn("px-4 py-3 text-zinc-300", col.className)}
                    >
                      {col.render
                        ? col.render(row)
                        : String(row[col.key] ?? "—")}
                    </td>
                  ))}
                  {renderExpanded && (
                    <td className="px-4 py-3 text-zinc-500">
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 transition-transform",
                          isExpanded && "rotate-90 text-green-400"
                        )}
                      />
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <tr className="bg-zinc-900/40">
                    <td colSpan={totalCols} className="px-4 py-3">
                      {renderExpanded(row)}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
