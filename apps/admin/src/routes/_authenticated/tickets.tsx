import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/utils";
import { Ticket } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tickets")({
  component: TicketsPage,
});

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
    case "low":
      return "default" as const;
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
    case "closed":
      return "default" as const;
    default:
      return "default" as const;
  }
}

function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const allTickets = useAdminQuery(api.admin.listSupportTickets, {});
  const updateStatus = useAdminMutation(api.admin.updateSupportTicketStatus);

  const tickets = allTickets
    ? allTickets.filter((t) => {
        if (statusFilter !== "all" && t.status !== statusFilter) return false;
        if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
        return true;
      })
    : allTickets;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Support Tickets</h1>

      <div className="mb-4 flex gap-4">
        <div className="w-48">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <div className="w-48">
          <Select
            options={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          />
        </div>
      </div>

      {!tickets ? (
        <Spinner />
      ) : tickets.length === 0 ? (
        <EmptyState icon={<Ticket className="h-8 w-8" />} title="No tickets found" />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-400">Name</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Email</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Category</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Subject</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Priority</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
                <th className="px-4 py-3 font-medium text-zinc-400">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {tickets.map((ticket) => (
                <Fragment key={ticket._id}>
                  <tr
                    className="cursor-pointer transition-colors hover:bg-zinc-800/30"
                    onClick={() =>
                      setExpandedId(expandedId === ticket._id ? null : ticket._id)
                    }
                  >
                    <td className="px-4 py-3 text-zinc-300">{ticket.name}</td>
                    <td className="px-4 py-3 text-zinc-400">{ticket.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="purple">{ticket.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{ticket.subject}</td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityBadgeVariant(ticket.priority)}>
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={ticket.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          updateStatus({
                            id: ticket._id as any,
                            status: e.target.value as any,
                          });
                        }}
                        className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                      >
                        {STATUS_CHANGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {formatDateTime(ticket._creationTime)}
                    </td>
                  </tr>
                  {expandedId === ticket._id && (
                    <tr key={`${ticket._id}-body`}>
                      <td colSpan={7} className="bg-zinc-900/30 px-6 py-4">
                        <p className="mb-1 text-xs font-medium text-zinc-400">Message</p>
                        <p className="whitespace-pre-wrap text-sm text-zinc-300">
                          {ticket.message}
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
