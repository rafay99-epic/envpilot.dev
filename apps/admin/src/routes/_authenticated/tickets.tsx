import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { formatDateTime } from "@/lib/utils";
import { SearchInput } from "@/components/ui/SearchInput";
import { toast } from "@/components/ui/Toast";
import { useFilteredList } from "@/hooks/useFilteredList";
import { Ticket } from "lucide-react";
import type { Doc } from "@convex/_generated/dataModel";

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
});

type TicketDoc = Doc<"supportTickets">;
type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const CATEGORY_OPTIONS = [
  { value: "all", label: "All Categories" },
  { value: "bug", label: "Bug" },
  { value: "account", label: "Account" },
  { value: "billing", label: "Billing" },
  { value: "cli", label: "CLI" },
  { value: "extension", label: "Extension" },
  { value: "other", label: "Other" },
];

const STATUS_CHANGE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function priorityBadgeVariant(priority: string) {
  switch (priority) {
    case "high":
      return "danger" as const;
    case "medium":
      return "warning" as const;
    default:
      return "default" as const;
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case "open":
      return "info" as const;
    case "in_progress":
      return "warning" as const;
    case "resolved":
      return "success" as const;
    default:
      return "default" as const;
  }
}

function TicketsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTickets = useAdminQuery(
    api.features.admin.inbox.listSupportTickets,
    {}
  );
  const updateStatus = useAdminMutation(
    api.features.admin.inbox.updateSupportTicketStatus
  );

  const tickets = allTickets
    ? allTickets.filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (categoryFilter !== "all" && t.category !== categoryFilter)
          return false;
        return true;
      })
    : undefined;

  const filteredTickets = useFilteredList(tickets, search, (t) => [
    t.subject,
    t.email,
    t.status,
  ]);

  const handleStatusChange = async (
    ticket: TicketDoc,
    status: TicketStatus
  ) => {
    try {
      await updateStatus({ id: ticket._id, status });
    } catch (err) {
      toast(
        "error",
        err instanceof Error ? err.message : "Failed to update ticket status"
      );
    }
  };

  const columns: Column<TicketDoc>[] = [
    { key: "name", header: "Name" },
    { key: "email", header: "Email", className: "text-zinc-400" },
    {
      key: "category",
      header: "Category",
      render: (t) => <Badge variant="purple">{t.category}</Badge>,
    },
    { key: "subject", header: "Subject" },
    {
      key: "priority",
      header: "Priority",
      render: (t) => (
        <Badge variant={priorityBadgeVariant(t.priority)}>{t.priority}</Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => (
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge>
          <Select
            aria-label={`Change status for ticket ${t.subject}`}
            options={STATUS_CHANGE_OPTIONS}
            value={t.status}
            onChange={(e) =>
              handleStatusChange(t, e.target.value as TicketStatus)
            }
            className="w-auto py-1 text-xs"
          />
        </div>
      ),
    },
    {
      key: "_creationTime",
      header: "Date",
      className: "text-zinc-400",
      render: (t) => formatDateTime(t._creationTime),
    },
  ];

  return (
    <div>
      <h1 className="mb-6 font-mono text-2xl font-semibold text-zinc-100">
        Support Tickets
      </h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search tickets..."
          className="w-72"
        />
        <div className="w-48">
          <Select
            aria-label="Filter by status"
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            aria-label="Filter by category"
            options={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-zinc-500">
          {search.trim()
            ? `${filteredTickets?.length ?? 0} of ${tickets?.length ?? 0} tickets`
            : `${tickets?.length ?? 0} tickets`}
        </span>
      </div>

      <QueryState
        data={filteredTickets}
        empty={{ message: "No tickets found" }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(t) => t._id}
            expandedId={expandedId}
            onExpandedChange={setExpandedId}
            renderExpanded={(t) => (
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-wider text-zinc-500">
                  Message
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-300">
                  {t.message}
                </p>
              </div>
            )}
          />
        )}
      </QueryState>
    </div>
  );
}
