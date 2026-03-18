import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { Lightbulb, Trash2, ChevronDown, ChevronUp, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/feature-requests")({
  component: FeatureRequestsPage,
});

type FeatureRequestStatus =
  | "submitted"
  | "under_review"
  | "planned"
  | "in_progress"
  | "completed"
  | "declined";

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under Review" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
];

function statusBadgeVariant(status: string) {
  switch (status) {
    case "submitted":
      return "default" as const;
    case "under_review":
      return "info" as const;
    case "planned":
      return "purple" as const;
    case "in_progress":
      return "warning" as const;
    case "completed":
      return "success" as const;
    case "declined":
      return "danger" as const;
    default:
      return "default" as const;
  }
}

function FeatureRequestsPage() {
  const requests = useAdminQuery(api.admin.listFeatureRequests, {});
  const updateStatus = useAdminMutation(api.admin.updateFeatureRequestStatus);
  const updateNotes = useAdminMutation(
    api.admin.updateFeatureRequestAdminNotes
  );
  const deleteRequest = useAdminMutation(api.admin.deleteFeatureRequest);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);

  const handleSaveNotes = async (requestId: Id<"featureRequests">) => {
    setSavingNotes(requestId);
    try {
      await updateNotes({
        id: requestId,
        adminNotes: editingNotes[requestId] ?? "",
      });
    } finally {
      setSavingNotes(null);
    }
  };

  const handleDelete = async (requestId: Id<"featureRequests">) => {
    if (!confirm("Delete this feature request?")) return;
    await deleteRequest({ id: requestId });
  };

  if (!requests) return <Spinner />;
  if (requests.length === 0)
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
          Feature Requests
        </h1>
        <EmptyState
          icon={<Lightbulb className="h-8 w-8" />}
          title="No feature requests"
        />
      </div>
    );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
        Feature Requests
      </h1>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-800 bg-zinc-900/50">
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-400">Title</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Status</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Category</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Votes</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Submitter</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Date</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {requests.map((req) => (
              <Fragment key={req._id}>
                <tr
                  className="cursor-pointer transition-colors hover:bg-zinc-800/30"
                  onClick={() => {
                    const newId = expandedId === req._id ? null : req._id;
                    setExpandedId(newId);
                    if (newId && !(req._id in editingNotes)) {
                      setEditingNotes((prev) => ({
                        ...prev,
                        [req._id]: (req.adminNotes as string) ?? "",
                      }));
                    }
                  }}
                >
                  <td className="px-4 py-3 text-zinc-300">
                    <div className="flex items-center gap-1">
                      {expandedId === req._id ? (
                        <ChevronUp className="h-3 w-3 text-zinc-500" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-zinc-500" />
                      )}
                      {req.title}
                    </div>
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <select
                      value={req.status}
                      onChange={(e) => {
                        updateStatus({
                          id: req._id,
                          status: e.target.value as FeatureRequestStatus,
                        });
                      }}
                      className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="purple">{req.category ?? "general"}</Badge>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {req.voteCount ?? 0}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {req.submitterName ?? req.submitterEmail ?? "Anonymous"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {formatDate(req._creationTime)}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(req._id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                  </td>
                </tr>
                {expandedId === req._id && (
                  <tr key={`${req._id}-details`}>
                    <td colSpan={7} className="bg-zinc-900/30 px-6 py-4">
                      <div className="space-y-4">
                        <div>
                          <p className="mb-1 text-xs font-medium text-zinc-400">
                            Description
                          </p>
                          <p className="whitespace-pre-wrap text-sm text-zinc-300">
                            {req.description ?? "No description provided."}
                          </p>
                        </div>
                        <div>
                          <Textarea
                            label="Admin Notes"
                            id={`notes-${req._id}`}
                            value={editingNotes[req._id] ?? ""}
                            onChange={(e) =>
                              setEditingNotes((prev) => ({
                                ...prev,
                                [req._id]: e.target.value,
                              }))
                            }
                            placeholder="Add internal notes..."
                            rows={3}
                          />
                          <Button
                            size="sm"
                            className="mt-2"
                            onClick={() => handleSaveNotes(req._id)}
                            disabled={savingNotes === req._id}
                          >
                            <Save className="h-3 w-3" />
                            {savingNotes === req._id
                              ? "Saving..."
                              : "Save Notes"}
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
