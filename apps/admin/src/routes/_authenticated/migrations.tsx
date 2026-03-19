import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  ArrowUpDown,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Layers,
  Database,
  Trash2,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/migrations")({
  component: MigrationsPage,
});

interface Migration {
  name: string;
  description: string;
  category: string;
  priority: number;
  destructive: boolean;
  runOnce: boolean;
}

interface MigrationResult {
  success: boolean;
  total?: number;
  migrated?: number;
  created?: number;
  skipped?: number;
  deleted?: number;
  deletedRequests?: number;
  deletedVotes?: number;
  duplicatesRemoved?: number;
}

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.ReactNode;
    dot: string;
    border: string;
    bg: string;
    text: string;
    description: string;
  }
> = {
  "Feature & Tier System": {
    icon: <Layers className="h-4 w-4" />,
    dot: "bg-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/5",
    text: "text-purple-400",
    description: "Run these when adding new features or updating tier limits",
  },
  "Content Seeding": {
    icon: <Database className="h-4 w-4" />,
    dot: "bg-blue-400",
    border: "border-blue-500/20",
    bg: "bg-blue-500/5",
    text: "text-blue-400",
    description: "Populate database tables with initial or historical data",
  },
  Destructive: {
    icon: <Trash2 className="h-4 w-4" />,
    dot: "bg-red-400",
    border: "border-red-500/20",
    bg: "bg-red-500/5",
    text: "text-red-400",
    description: "Wipe data — use before re-seeding or to start fresh",
  },
  "One-Time Migrations": {
    icon: <Clock className="h-4 w-4" />,
    dot: "bg-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    text: "text-amber-400",
    description: "Schema migrations that should only be run once per deploy",
  },
};

function formatResult(result: MigrationResult): string {
  const parts: string[] = [];
  if (result.total != null) parts.push(`Total: ${result.total}`);
  if (result.migrated != null) parts.push(`Migrated: ${result.migrated}`);
  if (result.created != null) parts.push(`Created: ${result.created}`);
  if (result.skipped != null) parts.push(`Skipped: ${result.skipped}`);
  if (result.deleted != null) parts.push(`Deleted: ${result.deleted}`);
  if (result.deletedRequests != null)
    parts.push(`Requests: ${result.deletedRequests}`);
  if (result.deletedVotes != null) parts.push(`Votes: ${result.deletedVotes}`);
  if (result.duplicatesRemoved != null)
    parts.push(`Deduped: ${result.duplicatesRemoved}`);
  return parts.length > 0 ? parts.join(" · ") : "Migration completed";
}

function MigrationsPage() {
  const migrations = useAdminQuery(api.admin.listMigrations, {});
  const runMigration = useAdminMutation(api.admin.runMigration);
  const { confirm } = useConfirmStore();

  const [runningName, setRunningName] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  const handleRun = async (migration: Migration) => {
    if (migration.destructive) {
      const ok = await confirm({
        title: `Run ${migration.name}?`,
        message:
          "This is a destructive operation that will permanently delete data. Are you sure?",
        confirmLabel: "Run Anyway",
        variant: "danger",
      });
      if (!ok) return;
    }

    if (migration.runOnce) {
      const ok = await confirm({
        title: `Run ${migration.name}?`,
        message:
          "This is a one-time migration. Running it again may cause issues if it has already been executed. Continue?",
        confirmLabel: "Run",
        variant: "warning",
      });
      if (!ok) return;
    }

    setRunningName(migration.name);
    try {
      const result = (await runMigration({
        name: migration.name,
      })) as MigrationResult;
      setResults((prev) => ({
        ...prev,
        [migration.name]: {
          success: !!result?.success,
          message: formatResult(result),
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [migration.name]: {
          success: false,
          message: err instanceof Error ? err.message : "Migration failed",
        },
      }));
    } finally {
      setRunningName(null);
    }
  };

  if (!migrations) return <Spinner />;
  if (migrations.length === 0)
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-zinc-100">
          Migrations
        </h1>
        <EmptyState
          icon={<ArrowUpDown className="h-8 w-8" />}
          title="No migrations available"
          description="Migrations will appear here when they are defined in the backend."
        />
      </div>
    );

  // Group by category, preserving priority order
  const grouped = new Map<string, Migration[]>();
  for (const m of migrations as Migration[]) {
    const cat = m.category ?? "Other";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(m);
  }

  // Sort within each group by priority
  for (const items of grouped.values()) {
    items.sort((a, b) => a.priority - b.priority);
  }

  // Fixed category order
  const categoryOrder = [
    "Feature & Tier System",
    "Content Seeding",
    "Destructive",
    "One-Time Migrations",
  ];
  const sortedCategories = categoryOrder.filter((c) => grouped.has(c));
  // Append any unknown categories at the end
  for (const cat of grouped.keys()) {
    if (!sortedCategories.includes(cat)) sortedCategories.push(cat);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Migrations</h1>

      <div className="space-y-8">
        {sortedCategories.map((category) => {
          const config = CATEGORY_CONFIG[category];
          const items = grouped.get(category)!;

          return (
            <div key={category}>
              {/* Category Header */}
              <div
                className={`mb-3 flex items-center gap-2.5 rounded-lg border px-4 py-2.5 ${
                  config?.border ?? "border-zinc-700"
                } ${config?.bg ?? "bg-zinc-800/50"}`}
              >
                <span className={config?.text ?? "text-zinc-400"}>
                  {config?.icon ?? <ArrowUpDown className="h-4 w-4" />}
                </span>
                <div>
                  <h2
                    className={`text-sm font-semibold ${config?.text ?? "text-zinc-300"}`}
                  >
                    {category}
                  </h2>
                  {config?.description && (
                    <p className="text-[11px] text-zinc-500">
                      {config.description}
                    </p>
                  )}
                </div>
                <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                  {items.length}
                </span>
              </div>

              {/* Migration Cards */}
              <div className="space-y-2 pl-2">
                {items.map((migration, idx) => (
                  <div
                    key={migration.name}
                    className={`flex items-start justify-between rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-700`}
                  >
                    <div className="mr-4 flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        {/* Priority number */}
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold text-zinc-400">
                          {idx + 1}
                        </span>
                        <h3 className="text-sm font-medium text-zinc-100">
                          {migration.name}
                        </h3>
                        {migration.destructive && (
                          <Badge variant="danger">destructive</Badge>
                        )}
                        {migration.runOnce && (
                          <Badge variant="warning">run once</Badge>
                        )}
                        {!migration.destructive && !migration.runOnce && (
                          <Badge variant="success">safe to re-run</Badge>
                        )}
                      </div>
                      <p className="pl-7 text-xs leading-relaxed text-zinc-500">
                        {migration.description}
                      </p>

                      {/* Result */}
                      {results[migration.name] && (
                        <div
                          className={`ml-7 mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs ${
                            results[migration.name].success
                              ? "bg-emerald-500/10 text-emerald-400"
                              : "bg-red-500/10 text-red-400"
                          }`}
                        >
                          {results[migration.name].success ? (
                            <CheckCircle className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {results[migration.name].message}
                        </div>
                      )}
                    </div>

                    <Button
                      variant={
                        migration.destructive ? "destructive" : "outline"
                      }
                      size="sm"
                      className="shrink-0"
                      onClick={() => handleRun(migration)}
                      disabled={runningName === migration.name}
                    >
                      {runningName === migration.name ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5" />
                          Run
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
