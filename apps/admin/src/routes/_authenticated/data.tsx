import {
  createFileRoute,
  useSearch,
  useNavigate,
} from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Database, Pencil, Trash2 } from "lucide-react";

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
  { value: "stripeCustomers", label: "stripeCustomers" },
  { value: "cliSessions", label: "cliSessions" },
  { value: "cliTokens", label: "cliTokens" },
  { value: "environmentTemplates", label: "environmentTemplates" },
  { value: "templateVariables", label: "templateVariables" },
  { value: "permissionRevocationEvents", label: "permissionRevocationEvents" },
  { value: "supportTickets", label: "supportTickets" },
  { value: "contactMessages", label: "contactMessages" },
  { value: "tierConfig", label: "tierConfig" },
  { value: "adminSettings", label: "adminSettings" },
];

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

  const tableData = useAdminQuery(
    api.admin.browseTable,
    table ? { tableName: table } : "skip"
  );

  const updateRow = useAdminMutation(api.admin.updateTableRow);
  const deleteRow = useAdminMutation(api.admin.deleteTableRow);

  const [editModal, setEditModal] = useState<{
    id: string;
    data: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTableChange = (newTable: string) => {
    navigate({
      to: "/data",
      search: newTable ? { table: newTable } : {},
    });
  };

  const handleEdit = (row: Record<string, unknown>) => {
    setEditModal({
      id: row._id as string,
      data: JSON.stringify(row, null, 2),
    });
  };

  const handleSave = async () => {
    if (!editModal || !table) return;
    setSaving(true);
    try {
      // Validate JSON
      JSON.parse(editModal.data);
      await updateRow({
        tableName: table,
        id: editModal.id,
        fields: editModal.data,
      });
      setEditModal(null);
    } catch (err) {
      alert(
        err instanceof SyntaxError
          ? "Invalid JSON"
          : err instanceof Error
            ? err.message
            : "Failed to save"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (rowId: string) => {
    if (!table) return;
    if (!confirm("Delete this row? This action cannot be undone.")) return;
    await deleteRow({ tableName: table, id: rowId });
  };

  // Build columns dynamically from data
  const rows = table ? tableData : undefined;
  const allKeys = new Set<string>();
  if (rows && Array.isArray(rows)) {
    rows.forEach((row: Record<string, unknown>) => {
      Object.keys(row).forEach((k) => allKeys.add(k));
    });
  }
  const columnKeys = Array.from(allKeys).filter(
    (k) => k !== "_id" && k !== "_creationTime"
  );
  // Put _id first, then sorted keys, then _creationTime last
  const orderedKeys = ["_id", ...columnKeys.sort(), "_creationTime"];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
        Data Browser
      </h1>

      <div className="mb-6 w-64">
        <Select
          label="Table"
          id="table-select"
          options={BROWSABLE_TABLES}
          value={table ?? ""}
          onChange={(e) => handleTableChange(e.target.value)}
        />
      </div>

      {!table ? (
        <EmptyState
          icon={<Database className="h-8 w-8" />}
          title="Select a table to browse"
          description="Choose a table from the dropdown above to view its data."
        />
      ) : !rows ? (
        <Spinner />
      ) : !Array.isArray(rows) || rows.length === 0 ? (
        <EmptyState title={`No rows in ${table}`} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-zinc-800 bg-zinc-900/50">
              <tr>
                {orderedKeys.map((key) => (
                  <th
                    key={key}
                    className="whitespace-nowrap px-3 py-2 font-medium text-zinc-400"
                  >
                    {key}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {(rows as Record<string, unknown>[]).map(
                (row: Record<string, unknown>, i: number) => (
                  <tr
                    key={(row._id as string) ?? i}
                    className="hover:bg-zinc-800/30"
                  >
                    {orderedKeys.map((key) => (
                      <td
                        key={key}
                        className="max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-zinc-300"
                        title={String(row[key] ?? "")}
                      >
                        {row[key] === null || row[key] === undefined
                          ? "\u2014"
                          : typeof row[key] === "object"
                            ? JSON.stringify(row[key])
                            : String(row[key])}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(row)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(row._id as string)}
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={!!editModal}
        onClose={() => setEditModal(null)}
        title="Edit Row"
        className="max-w-2xl"
      >
        <div className="space-y-4">
          <Textarea
            label="JSON Data"
            id="edit-row-data"
            value={editModal?.data ?? ""}
            onChange={(e) =>
              setEditModal((prev) =>
                prev ? { ...prev, data: e.target.value } : null
              )
            }
            rows={15}
            className="font-mono text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditModal(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
