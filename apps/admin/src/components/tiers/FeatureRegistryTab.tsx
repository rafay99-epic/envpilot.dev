import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toast";

interface FeatureRow extends Record<string, unknown> {
  _id: Id<"featureRegistry">;
  key: string;
  displayName: string;
  valueType: string;
  category: string;
  defaultValue: string;
  isActive: boolean;
}

export function FeatureRegistryTab() {
  const featureRegistry = useAdminQuery(
    api.features.admin.featureFlags.listFeatureRegistry,
    {}
  );
  const toggleFeatureActive = useAdminMutation(
    api.features.admin.featureFlags.toggleFeatureActive
  );

  const columns: Column<FeatureRow>[] = [
    {
      key: "key",
      header: "Key",
      sortable: true,
      render: (f) => (
        <span className="font-mono text-xs text-ink-muted">{f.key}</span>
      ),
    },
    { key: "displayName", header: "Display Name", sortable: true },
    {
      key: "valueType",
      header: "Type",
      render: (f) => (
        <Badge variant={f.valueType === "boolean" ? "default" : "purple"}>
          {f.valueType}
        </Badge>
      ),
    },
    { key: "category", header: "Category", sortable: true },
    {
      key: "defaultValue",
      header: "Default",
      render: (f) => (
        <span className="text-xs text-ink-muted">
          {f.defaultValue === "null" ? "unlimited" : f.defaultValue}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Active",
      className: "text-center",
      render: (f) => (
        <ActiveToggle
          active={f.isActive}
          label={f.displayName}
          onToggle={async (next) => {
            await toggleFeatureActive({ featureId: f._id, isActive: next });
            toast(
              "success",
              `${f.displayName} ${next ? "activated" : "deactivated"}`
            );
          }}
        />
      ),
    },
  ];

  return (
    <section data-wide>
      <h2 className="mb-4 text-lg font-semibold text-ink">
        Feature Registry
      </h2>
      <p className="mb-4 text-xs text-ink-subtle">
        Features are developer-seeded. Admin can only toggle active/inactive.
      </p>
      <QueryState
        data={featureRegistry as unknown as FeatureRow[] | undefined}
        empty={{ message: "No features registered." }}
      >
        {(rows) => (
          <DataTable columns={columns} data={rows} rowKey={(f) => f._id} />
        )}
      </QueryState>
    </section>
  );
}

function ActiveToggle({
  active,
  label,
  onToggle,
}: {
  active: boolean;
  label: string;
  onToggle: (next: boolean) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="flex justify-center">
      <Switch
        checked={active}
        disabled={saving}
        size="sm"
        onChange={async (next) => {
          setSaving(true);
          try {
            await onToggle(next);
          } catch (err) {
            toast(
              "error",
              err instanceof Error ? err.message : "Failed to toggle feature"
            );
          } finally {
            setSaving(false);
          }
        }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
