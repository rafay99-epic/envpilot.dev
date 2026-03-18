import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAdminQuery, useAdminMutation } from "@/hooks/useAdminQuery";
import { api } from "@convex/_generated/api";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArrowUpDown, Play, CheckCircle, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/migrations")({
  component: MigrationsPage,
});

interface MigrationResult {
  success: boolean;
  total?: number;
  migrated?: number;
  skipped?: number;
}

function MigrationsPage() {
  const migrations = useAdminQuery(api.admin.listMigrations, {});
  const runMigration = useAdminMutation(api.admin.runMigration);

  const [runningName, setRunningName] = useState<string | null>(null);
  const [results, setResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});

  const handleRun = async (name: string) => {
    setRunningName(name);
    try {
      const result = await runMigration({ name }) as MigrationResult;
      setResults((prev) => ({
        ...prev,
        [name]: {
          success: !!result?.success,
          message: result?.total != null
            ? `Total: ${result.total}, Migrated: ${result.migrated}, Skipped: ${result.skipped}`
            : "Migration completed",
        },
      }));
    } catch (err) {
      setResults((prev) => ({
        ...prev,
        [name]: {
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
        <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Migrations</h1>
        <EmptyState
          icon={<ArrowUpDown className="h-8 w-8" />}
          title="No migrations available"
          description="Migrations will appear here when they are defined in the backend."
        />
      </div>
    );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-zinc-100">Migrations</h1>

      <div className="space-y-4">
        {migrations.map((migration) => (
          <Card key={migration.name} className="flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="font-medium text-zinc-100">{migration.name}</h3>
              </div>
              <p className="text-sm text-zinc-400">{migration.description}</p>

              {results[migration.name] && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    results[migration.name].success
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {results[migration.name].success ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {results[migration.name].message}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-4"
              onClick={() => handleRun(migration.name)}
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
          </Card>
        ))}
      </div>
    </div>
  );
}
