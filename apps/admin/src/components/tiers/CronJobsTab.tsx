import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { toast } from "@/components/ui/Toast";
import { Timer, Pause, Play } from "lucide-react";

interface CronRow extends Record<string, unknown> {
  settingKey: string;
  name: string;
  function: string;
  interval: string;
  paused: boolean;
}

export function CronJobsTab() {
  const cronJobs = useAdminQuery(api.features.admin.crons.listCronJobs, {});
  const toggleCronPause = useAdminMutation(
    api.features.admin.crons.toggleCronPause
  );

  const columns: Column<CronRow>[] = [
    { key: "name", header: "Name", sortable: true },
    {
      key: "function",
      header: "Function",
      render: (c) => (
        <span className="font-mono text-xs text-ink-muted">{c.function}</span>
      ),
    },
    { key: "interval", header: "Interval" },
    {
      key: "paused",
      header: "Status",
      className: "text-center",
      render: (c) => (
        <Badge variant={c.paused ? "danger" : "success"}>
          {c.paused ? "Paused" : "Running"}
        </Badge>
      ),
    },
    {
      key: "action",
      header: "Action",
      className: "text-center",
      render: (c) => (
        <PauseButton
          paused={c.paused}
          onToggle={async () => {
            const result = await toggleCronPause({ settingKey: c.settingKey });
            toast(
              "success",
              `${c.name} ${result.paused ? "paused" : "resumed"}`
            );
          }}
        />
      ),
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-ink">
        <Timer className="mr-2 inline h-4 w-4 text-ink-muted" />
        Cron Jobs
      </h2>
      <p className="mb-4 text-xs text-ink-subtle">
        Crons run on a fixed schedule. Pausing makes the handler skip all work —
        the cron still fires but does nothing.
      </p>
      <QueryState
        data={cronJobs as unknown as CronRow[] | undefined}
        empty={{ message: "No cron jobs found." }}
      >
        {(rows) => (
          <DataTable
            columns={columns}
            data={rows}
            rowKey={(c) => c.settingKey}
          />
        )}
      </QueryState>
    </section>
  );
}

function PauseButton({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Button
      variant={paused ? "default" : "outline"}
      size="sm"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          await onToggle();
        } catch (err) {
          toast(
            "error",
            err instanceof Error ? err.message : "Failed to toggle cron"
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      {paused ? (
        <>
          <Play className="h-3 w-3" /> Resume
        </>
      ) : (
        <>
          <Pause className="h-3 w-3" /> Pause
        </>
      )}
    </Button>
  );
}
