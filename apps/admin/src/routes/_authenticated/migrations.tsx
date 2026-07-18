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
  Database,
  Trash2,
  Clock,
  ChevronRight,
  GitBranch,
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

/** These five run automatically on every CI deploy — manual runs are just for out-of-band fixes. */
const CI_MANAGED_KEYS = new Set([
  "seed-feature-registry",
  "seed-tier-features",
  "seed-role-registry",
  "migrate-roles",
  "seed-changelog",
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
  "Active Bridge": {
    icon: <GitBranch className="h-4 w-4" />,
    dot: "bg-amber-400",
    border: "border-amber-500/20",
    bg: "bg-amber-500/5",
    text: "text-amber-400",
    description:
      "Ongoing compatibility bridge — safe to re-run, keep running until the legacy path is retired",
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
    <div className="flex items-start justify-between rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 transition-colors hover:border-zinc-700">
      <div className="mr-4 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-800 text-[10px] font-bold text-zinc-400">
            {index + 1}
          </span>
          <h3 className="text-sm font-medium text-zinc-100">
            {migration.name}
          </h3>
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
        <p className="pl-7 text-xs leading-relaxed text-zinc-500">
          {migration.description}
        </p>

        {result && (
          <div
            className={`ml-7 mt-2 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 font-mono text-xs ${
              result.success
                ? "border-green-500/20 bg-green-500/10 text-green-400"
                : "border-red-500/20 bg-red-500/10 text-red-400"
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
            <p className="text-[11px] text-zinc-500">{config.description}</p>
          )}
        </div>
        {category === "Active Bridge" && (
          <Badge variant="warning">active bridge</Badge>
        )}
        <span className="ml-auto rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
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
  const [legacyOpen, setLegacyOpen] = useState(false);

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
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Migrations</h1>

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

          const seedsCategories = [
            "Feature & Tier System",
            "Content Seeding",
            "Destructive",
          ].filter((c) => grouped.has(c));
          const bridgeItems = grouped.get("Active Bridge");
          const legacyItems = grouped.get("One-Time Migrations");

          const knownCategories = new Set([
            ...seedsCategories,
            "Active Bridge",
            "One-Time Migrations",
          ]);
          const otherCategories = [...grouped.keys()].filter(
            (c) => !knownCategories.has(c)
          );

          if (list.length === 0) {
            return (
              <p className="text-sm text-zinc-500">No migrations available.</p>
            );
          }

          return (
            <div className="space-y-10">
              {/* Seeds & Tools */}
              {seedsCategories.length > 0 && (
                <section>
                  <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-zinc-500">
                    Seeds &amp; Tools
                  </h2>
                  <p className="mb-4 font-mono text-[11px] text-zinc-500">
                    seed-feature-registry, seed-tier-features,
                    seed-role-registry, migrate-roles, seed-changelog — runs
                    automatically on every deploy
                  </p>
                  <div className="space-y-8">
                    {seedsCategories.map((category) => (
                      <CategoryGroup
                        key={category}
                        category={category}
                        items={grouped.get(category)!}
                        runningName={runningName}
                        results={results}
                        onRun={handleRun}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Active Bridge */}
              {bridgeItems && bridgeItems.length > 0 && (
                <section>
                  <h2 className="mb-3 font-mono text-xs uppercase tracking-wide text-zinc-500">
                    Active Bridge
                  </h2>
                  <CategoryGroup
                    category="Active Bridge"
                    items={bridgeItems}
                    runningName={runningName}
                    results={results}
                    onRun={handleRun}
                  />
                </section>
              )}

              {/* Legacy — collapsed by default */}
              {legacyItems && legacyItems.length > 0 && (
                <section>
                  <button
                    type="button"
                    aria-expanded={legacyOpen}
                    onClick={() => setLegacyOpen((v) => !v)}
                    className="mb-3 flex w-full items-center gap-2 font-mono text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform ${
                        legacyOpen ? "rotate-90" : ""
                      }`}
                    />
                    Legacy
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] normal-case text-zinc-500">
                      {legacyItems.length}
                    </span>
                  </button>
                  {legacyOpen && (
                    <>
                      <p className="mb-4 font-mono text-[11px] text-zinc-500">
                        one-shot drains — run once, confirm 0 remaining, then
                        these get deleted
                      </p>
                      <CategoryGroup
                        category="One-Time Migrations"
                        items={legacyItems}
                        runningName={runningName}
                        results={results}
                        onRun={handleRun}
                      />
                    </>
                  )}
                </section>
              )}

              {/* Unknown categories, appended at the end */}
              {otherCategories.length > 0 && (
                <section className="space-y-8">
                  {otherCategories.map((category) => (
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
