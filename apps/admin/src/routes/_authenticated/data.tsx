import {
  createFileRoute,
  useSearch,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import {
  useAdminMutation,
  useAdminPaginatedQuery,
} from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { KebabMenu, type KebabMenuItem } from "@/components/ui/KebabMenu";
import { PaginationControls } from "@/components/ui/PaginationControls";
import { CellValue } from "@/components/data-browser/CellValue";
import { RowEditDrawer } from "@/components/data-browser/RowEditDrawer";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  Database,
  Pencil,
  Copy,
  Trash2,
  Columns3,
  RefreshCw,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BROWSABLE_TABLES = [
  { value: "", label: "Select a table..." },
  { value: "users", label: "users" },
  { value: "userPreferences", label: "userPreferences" },
  { value: "organizations", label: "organizations" },
  { value: "organizationMembers", label: "organizationMembers" },
  { value: "organizationTiers", label: "organizationTiers" },
  { value: "projects", label: "projects" },
  { value: "favoriteProjects", label: "favoriteProjects" },
  { value: "projectMembers", label: "projectMembers" },
  { value: "environmentVariables", label: "environmentVariables" },
  {
    value: "environmentVariableRequests",
    label: "environmentVariableRequests",
  },
  { value: "variableVersions", label: "variableVersions" },
  { value: "variablePermissions", label: "variablePermissions" },
  { value: "projectAccess", label: "projectAccess" },
  { value: "invitations", label: "invitations" },
  { value: "featureRequests", label: "featureRequests" },
  { value: "featureVotes", label: "featureVotes" },
  { value: "changelog", label: "changelog" },
  { value: "auditLogs", label: "auditLogs" },
  { value: "subscriptions", label: "subscriptions" },
  { value: "polarCustomers", label: "polarCustomers" },
  { value: "cliSessions", label: "cliSessions" },
  { value: "cliTokens", label: "cliTokens" },
  { value: "environmentTemplates", label: "environmentTemplates" },
  { value: "templateVariables", label: "templateVariables" },
  {
    value: "permissionRevocationEvents",
    label: "permissionRevocationEvents",
  },
  { value: "supportTickets", label: "supportTickets" },
  { value: "contactMessages", label: "contactMessages" },
  { value: "tierDefinitions", label: "tierDefinitions" },
  { value: "adminSettings", label: "adminSettings" },
  { value: "paymentProducts", label: "paymentProducts" },
  { value: "processedWebhookEvents", label: "processedWebhookEvents" },
];

const PAGE_SIZE = 50;

type SearchParams = { table?: string };

export const Route = createFileRoute("/_authenticated/data")({
  component: DataBrowserPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    table: (search.table as string) || undefined,
  }),
});

function DataBrowserPage() {
  const { table } = useSearch({ from: "/_authenticated/data" });
  const navigate = useNavigate();
  const { confirm } = useConfirmStore();

  // Paginated data fetch
  const {
    results: rows,
    status,
    loadMore,
  } = useAdminPaginatedQuery(
    api.features.admin.tables.browseTablePaginated,
    table ? { tableName: table } : "skip",
    { initialNumItems: PAGE_SIZE }
  );

  const updateRow = useAdminMutation(api.features.admin.tables.updateTableRow);
  const deleteRow = useAdminMutation(api.features.admin.tables.deleteTableRow);

  const [search, setSearch] = useState("");
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Reset state when table changes
  const handleTableChange = (newTable: string) => {
    setSearch("");
    setHiddenColumns(new Set());
    setSortKey(null);
    setEditRow(null);
    setShowColumnPicker(false);
    navigate({
      to: "/data",
      search: newTable ? { table: newTable } : {},
    });
  };

  // Build ordered column keys from all loaded rows
  const allKeys = new Set<string>();
  if (rows) {
    for (const row of rows as Record<string, unknown>[]) {
      for (const k of Object.keys(row)) {
        allKeys.add(k);
      }
    }
  }
  const columnKeys = Array.from(allKeys)
    .filter((k) => k !== "_id" && k !== "_creationTime")
    .sort();
  const orderedKeys = ["_id", ...columnKeys, "_creationTime"];

  // Visible columns
  const visibleKeys = orderedKeys.filter((k) => !hiddenColumns.has(k));

  // Client-side search filter
  let displayRows: Record<string, unknown>[] = [];
  if (rows) {
    if (!search.trim()) {
      displayRows = rows as Record<string, unknown>[];
    } else {
      const term = search.toLowerCase();
      displayRows = (rows as Record<string, unknown>[]).filter((row) =>
        Object.values(row).some(
          (v) => typeof v === "string" && v.toLowerCase().includes(term)
        )
      );
    }
  }

  // Client-side sorting
  if (sortKey && displayRows.length > 0) {
    displayRows = [...displayRows].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const handleSave = async (id: string, fields: string) => {
    if (!table) return;
    await updateRow({ tableName: table, id, fields });
  };

  const handleDelete = async (id: string) => {
    if (!table) return;
    const ok = await confirm({
      title: "Delete Row",
      message: "This row will be permanently deleted. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteRow({ tableName: table, id });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const getRowActions = (row: Record<string, unknown>): KebabMenuItem[] => [
    {
      label: "Edit",
      icon: <Pencil className="h-3.5 w-3.5" />,
      onClick: () => setEditRow(row),
    },
    {
      label: "Copy ID",
      icon: <Copy className="h-3.5 w-3.5" />,
      onClick: () => copyToClipboard(row._id as string),
    },
    {
      label: "Delete",
      icon: <Trash2 className="h-3.5 w-3.5" />,
      onClick: () => handleDelete(row._id as string),
      variant: "danger",
    },
  ];

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div data-wide>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
        Data Browser
      </h1>

      {/* Command bar */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Select
            label="Table"
            id="table-select"
            options={BROWSABLE_TABLES}
            value={table ?? ""}
            onChange={(e) => handleTableChange(e.target.value)}
          />
        </div>

        {table && (
          <>
            <div className="flex w-64 flex-col gap-1">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Filter loaded rows..."
              />
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                filters loaded rows only
              </span>
            </div>

            {/* Column visibility */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                aria-label="Toggle column visibility"
                onClick={() => setShowColumnPicker(!showColumnPicker)}
              >
                <Columns3 className="h-3.5 w-3.5" />
                Columns
              </Button>
              {showColumnPicker && (
                <ColumnPicker
                  allKeys={Array.from(allKeys)}
                  hiddenColumns={hiddenColumns}
                  onToggle={toggleColumn}
                  onClose={() => setShowColumnPicker(false)}
                />
              )}
            </div>

            {/* Refresh */}
            <Button
              variant="ghost"
              size="sm"
              aria-label="Refresh table data"
              title="Refresh"
              onClick={() => handleTableChange(table)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Row count summary */}
      {table && rows && (
        <p className="mb-3 font-mono text-xs uppercase tracking-wider text-zinc-500">
          {search.trim()
            ? `${displayRows.length} of ${rows.length} loaded rows match filter`
            : `${rows.length} rows loaded`}
          {status === "Exhausted" && " (all loaded)"}
        </p>
      )}

      {/* Table */}
      {!table ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="Select a table to browse"
          description="Choose a table from the dropdown above to view its data."
        />
      ) : (
        <QueryState
          data={status === "LoadingFirstPage" ? undefined : rows}
          empty={{
            when: displayRows.length === 0,
            message: search.trim() ? "No matching rows" : `No rows in ${table}`,
            command: search.trim() ? undefined : `browse ${table}`,
          }}
        >
          {() => (
            <>
              <div className="max-h-[calc(100vh-280px)] overflow-auto rounded-lg border border-zinc-700/50">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-900">
                    <tr>
                      {visibleKeys.map((key) => (
                        <th
                          key={key}
                          className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-mono text-[0.68rem] font-medium uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                          onClick={() => handleSort(key)}
                        >
                          <span className="inline-flex items-center gap-1">
                            {key}
                            {sortKey === key &&
                              (sortDir === "asc" ? (
                                <ChevronUp className="h-3 w-3 text-green-400" />
                              ) : (
                                <ChevronDown className="h-3 w-3 text-green-400" />
                              ))}
                          </span>
                        </th>
                      ))}
                      <th className="sticky right-0 w-10 bg-zinc-900 px-2 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {displayRows.map((row, i) => (
                      <tr
                        key={(row._id as string) ?? i}
                        className="cursor-pointer transition-colors hover:bg-green-500/5"
                        onClick={() => setEditRow(row)}
                      >
                        {visibleKeys.map((key) => (
                          <td
                            key={key}
                            className="max-w-[240px] whitespace-nowrap px-3 py-2 text-sm text-zinc-300"
                          >
                            <CellValue value={row[key]} fieldKey={key} />
                          </td>
                        ))}
                        <td className="sticky right-0 bg-zinc-950 px-2 py-2">
                          <KebabMenu items={getRowActions(row)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <PaginationControls
                status={status}
                loadMore={loadMore}
                numItems={PAGE_SIZE}
                loadedCount={rows.length}
              />
            </>
          )}
        </QueryState>
      )}

      {/* Edit drawer */}
      <RowEditDrawer
        isOpen={!!editRow}
        onClose={() => setEditRow(null)}
        row={editRow}
        tableName={table ?? ""}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  );
}

// ─── Column Picker Dropdown ─────────────────────────────

function ColumnPicker({
  allKeys,
  hiddenColumns,
  onToggle,
  onClose,
}: {
  allKeys: string[];
  hiddenColumns: Set<string>;
  onToggle: (key: string) => void;
  onClose: () => void;
}) {
  // Sort: _id first, _creationTime last, rest alphabetical
  const sorted = [...allKeys].sort((a, b) => {
    if (a === "_id") return -1;
    if (b === "_id") return 1;
    if (a === "_creationTime") return 1;
    if (b === "_creationTime") return -1;
    return a.localeCompare(b);
  });

  return (
    <>
      {/* Backdrop to close */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
        {sorted.map((key) => (
          <div key={key} className="px-3 py-1.5 hover:bg-zinc-800">
            <Switch
              id={`col-${key}`}
              size="sm"
              checked={!hiddenColumns.has(key)}
              onChange={() => onToggle(key)}
              label={key}
              className={cn(hiddenColumns.has(key) && "text-zinc-500")}
            />
          </div>
        ))}
      </div>
    </>
  );
}
