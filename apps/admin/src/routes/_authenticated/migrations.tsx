import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { QueryState } from "@/components/ui/QueryState";
import { useConfirmStore } from "@/stores/confirm-store";
import {
  ArrowUpDown,
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Layers,
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
  [key: string]: unknown;
}

/**
 * The three `deploy-convex.yml` runs on every deploy — manual runs are only
 * for out-of-band fixes. Everything else in the list is manual by design.
 */
const CI_MANAGED_KEYS = new Set([
  "seed-feature-registry",
  "seed-tier-features",
  "seed-role-registry",
]);

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
  Core: {
    icon: <Layers className="h-4 w-4" />,
    dot: "bg-premium",
    border: "border-premium-line",
    bg: "bg-premium-soft",
    text: "text-premium",
    description:
      "The seeds the platform needs to function, plus the registry purge. Everything here is idempotent unless flagged destructive.",
  },
};

/** Turn a camelCase result key into a readable label, e.g. "orgMembersToOwner" → "Org members to owner". */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Generic key/value rendering of whatever the migration returned (minus `success`). */
function formatResult(result: MigrationResult): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(result)) {
    if (key === "success" || value == null) continue;
    if (
      typeof value === "number" ||
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      parts.push(`${humanizeKey(key)}: ${value}`);
    }
  }
  return parts.length > 0 ? parts.join(" · ") : "Migration completed";
}

type ResultMap = Record<string, { success: boolean; message: string }>;

function MigrationRow({
  migration,
  index,
  running,
  result,
  onRun,
}: {
  migration: Migration;
  index: number;
  running: boolean;
  result: ResultMap[string] | undefined;
  onRun: (migration: Migration) => void;
}) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-line bg-surface/40 px-4 py-3 transition-colors hover:border-line">
      <div className="mr-4 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-raised text-[10px] font-bold text-ink-muted">
            {index + 1}
          </span>
          <h3 className="text-sm font-medium text-ink">{migration.name}</h3>
          {migration.destructive && <Badge variant="danger">destructive</Badge>}
          {migration.runOnce && <Badge variant="warning">run once</Badge>}
          {CI_MANAGED_KEYS.has(migration.name) && (
            <Badge variant="info">ci-managed</Badge>
          )}
          {!migration.destructive &&
            !migration.runOnce &&
            !CI_MANAGED_KEYS.has(migration.name) && (
              <Badge variant="success">safe to re-run</Badge>
            )}
        </div>
        <p className="pl-7 text-xs leading-relaxed text-ink-subtle">
          {migration.description}
        </p>

        {result && (
          <div
            className={`ml-7 mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs ${
              result.success
                ? "border-accent-line bg-accent-soft text-accent"
                : "border-danger-line bg-danger-soft text-danger"
            }`}
          >
            {result.success ? (
              <CheckCircle className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {result.message}
          </div>
        )}
      </div>

      <Button
        variant={migration.destructive ? "destructive" : "outline"}
        size="sm"
        className="shrink-0"
        onClick={() => onRun(migration)}
        disabled={running}
      >
        {running ? (
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
  );
}

function CategoryGroup({
  category,
  items,
  runningName,
  results,
  onRun,
}: {
  category: string;
  items: Migration[];
  runningName: string | null;
  results: ResultMap;
  onRun: (migration: Migration) => void;
}) {
  const config = CATEGORY_CONFIG[category];
  return (
    <div>
      <div
        className={`mb-3 flex items-center gap-2.5 rounded-lg border px-4 py-2.5 ${
          config?.border ?? "border-line"
        } ${config?.bg ?? "bg-surface-raised/50"}`}
      >
        <span className={config?.text ?? "text-ink-muted"}>
          {config?.icon ?? <ArrowUpDown className="h-4 w-4" />}
        </span>
        <div>
          <h2
            className={`text-sm font-semibold ${config?.text ?? "text-ink-muted"}`}
          >
            {category}
          </h2>
          {config?.description && (
            <p className="text-[11px] text-ink-subtle">{config.description}</p>
          )}
        </div>
        {category === "Active Bridge" && (
          <Badge variant="warning">active bridge</Badge>
        )}
        <span className="ml-auto rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-ink-subtle">
          {items.length}
        </span>
      </div>

      <div className="space-y-2 pl-2">
        {items.map((migration, idx) => (
          <MigrationRow
            key={migration.name}
            migration={migration}
            index={idx}
            running={runningName === migration.name}
            result={results[migration.name]}
            onRun={onRun}
          />
        ))}
      </div>
    </div>
  );
}

function MigrationsPage() {
  const migrations = useAdminQuery(
    api.features.admin.migrations.listMigrations,
    {}
  );
  const runMigration = useAdminMutation(
    api.features.admin.migrations.runMigration
  );
  const { confirm } = useConfirmStore();

  const [runningName, setRunningName] = useState<string | null>(null);
  const [results, setResults] = useState<ResultMap>({});

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

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-ink">Migrations</h1>

      <QueryState
        data={migrations as Migration[] | undefined}
        empty={{
          message: "No migrations available",
        }}
      >
        {(list) => {
          const grouped = new Map<string, Migration[]>();
          for (const m of list) {
            const cat = m.category ?? "Other";
            if (!grouped.has(cat)) grouped.set(cat, []);
            grouped.get(cat)!.push(m);
          }
          for (const items of grouped.values()) {
            items.sort((a, b) => a.priority - b.priority);
          }

          // One category now. Anything the backend adds under a new name still
          // renders — it lands in `extraCategories` rather than disappearing.
          const coreItems = grouped.get("Core");
          const extraCategories = [...grouped.keys()].filter(
            (c) => c !== "Core"
          );

          if (list.length === 0) {
            return (
              <p className="text-sm text-ink-subtle">
                No migrations available.
              </p>
            );
          }

          return (
            <div className="space-y-10">
              {coreItems && coreItems.length > 0 && (
                <CategoryGroup
                  category="Core"
                  items={coreItems}
                  runningName={runningName}
                  results={results}
                  onRun={handleRun}
                />
              )}

              {/* Any category the backend introduces later. */}
              {extraCategories.length > 0 && (
                <section className="space-y-8">
                  {extraCategories.map((category) => (
                    <CategoryGroup
                      key={category}
                      category={category}
                      items={grouped.get(category)!}
                      runningName={runningName}
                      results={results}
                      onRun={handleRun}
                    />
                  ))}
                </section>
              )}
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
