import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toast";
import { RotateCcw } from "lucide-react";

interface RotationRow extends Record<string, unknown> {
  _id: Id<"environmentVariables">;
  key: string;
  projectName: string;
  rotationFrequencyDays: number;
  expiresAt: number;
  rotationStatus: string;
}

const PRESETS = [
  { label: "2m", minutes: 2 },
  { label: "30m", minutes: 30 },
  { label: "5h", minutes: 300 },
  { label: "Past", minutes: -1 },
];

export function RotationVariablesTab() {
  const rotationVars = useAdminQuery(
    api.features.admin.variables.listRotationVariables,
    {}
  );
  const updateVariableExpiry = useAdminMutation(
    api.features.admin.variables.updateVariableExpiry
  );

  const columns: Column<RotationRow>[] = [
    {
      key: "key",
      header: "Variable",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs text-ink-muted">{v.key}</span>
      ),
    },
    { key: "projectName", header: "Project", sortable: true },
    {
      key: "rotationFrequencyDays",
      header: "Frequency",
      render: (v) => (
        <span className="text-xs text-ink-muted">
          {v.rotationFrequencyDays}d
        </span>
      ),
    },
    {
      key: "expiresAt",
      header: "Expires At",
      sortable: true,
      render: (v) => (
        <span className="text-xs text-ink-muted">
          {new Date(v.expiresAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "rotationStatus",
      header: "Status",
      className: "text-center",
      render: (v) => (
        <Badge
          variant={
            v.rotationStatus === "expired"
              ? "danger"
              : v.rotationStatus === "expiring_soon"
                ? "warning"
                : "success"
          }
        >
          {v.rotationStatus}
        </Badge>
      ),
    },
    {
      key: "quickSet",
      header: "Quick Set",
      className: "text-center",
      render: (v) => (
        <div className="flex items-center justify-center gap-1">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={async () => {
                try {
                  const newExpiry =
                    preset.minutes < 0
                      ? Date.now() - 1000
                      : Date.now() + preset.minutes * 60 * 1000;
                  await updateVariableExpiry({
                    variableId: v._id,
                    expiresAt: newExpiry,
                    rotationStatus: "active",
                  });
                  toast(
                    "success",
                    `${v.key} expiry set to ${preset.label === "Past" ? "expired" : preset.label + " from now"}`
                  );
                } catch (err) {
                  toast(
                    "error",
                    err instanceof Error ? err.message : "Failed to update"
                  );
                }
              }}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                preset.minutes < 0
                  ? "bg-danger-soft text-danger hover:bg-danger-soft"
                  : "bg-info-soft text-info hover:bg-info-soft"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ),
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-ink">
        <RotateCcw className="mr-2 inline h-4 w-4 text-ink-muted" />
        Rotation-Enabled Variables
      </h2>
      <p className="mb-4 text-xs text-ink-subtle">
        Edit expiry timestamps for testing. Click a time to set it to minutes
        from now.
      </p>
      <QueryState
        data={rotationVars as unknown as RotationRow[] | undefined}
        empty={{ message: "No rotation-enabled variables found." }}
      >
        {(rows) => (
          <DataTable columns={columns} data={rows} rowKey={(v) => v._id} />
        )}
      </QueryState>
    </section>
  );
}
