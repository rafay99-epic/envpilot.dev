"use client";

import { useState, use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import {
  ArrowLeft,
  KeyRound,
  Loader2,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useProjects, useConvexUser } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { ConfirmDialog } from "@/components/ui";
import { roleLevel, ROLE_LEVEL } from "@/lib/roles";

// Mirrors PURGE_RETENTION_DAYS in convex/features/vault/gc.ts (server-only
// module — must not end up in the client bundle).
const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(timestamp: number): number {
  return Math.max(0, Math.floor((Date.now() - timestamp) / DAY_MS));
}

function daysLeft(deletedAt: number): number {
  const remaining = deletedAt + RETENTION_DAYS * DAY_MS - Date.now();
  return Math.max(0, Math.ceil(remaining / DAY_MS));
}

function pluralDays(count: number): string {
  return `${count} day${count === 1 ? "" : "s"}`;
}

interface TrashPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Project trash — soft-deleted variables and shared accounts inside their
 * 7-day restore window. Items render disabled (they ARE disabled — nothing
 * serves them) with a restore action each, plus a permanent "Empty trash"
 * for owners / assigned managers that destroys Vault objects and rows now,
 * skipping the remaining retention days.
 */
export default function TrashPage({ params }: TrashPageProps) {
  const { slug } = use(params);
  const { organization, user } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjects(orgId, convexUserId ?? undefined)?.projects.find(
    (p) => p.slug === slug
  );
  const projectId = project?._id as Id<"projects"> | undefined;

  const deletedVariables = useQuery(
    api.features.variables.queries.getDeleted,
    projectId && convexUserId ? { projectId } : "skip"
  );
  const deletedAccounts = useQuery(
    api.features.accounts.queries.getDeleted,
    projectId && convexUserId
      ? { projectId, userId: convexUserId as Id<"users"> }
      : "skip"
  );

  const restoreVariable = useMutation(api.features.variables.mutations.restore);
  const restoreAccount = useMutation(api.features.accounts.mutations.restore);
  const emptyTrash = useAction(api.features.vault.gc.emptyProjectTrash);

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Empty-trash mirrors variable deletion capability: owner implicit,
  // assigned PM / team lead. The server re-checks; this only hides the button.
  const canEmpty =
    roleLevel(organization?.role ?? "") >= ROLE_LEVEL.team_lead ||
    organization?.role === "owner";

  const loading =
    project === undefined ||
    deletedVariables === undefined ||
    deletedAccounts === undefined;

  const totalCount =
    (deletedVariables?.length ?? 0) + (deletedAccounts?.length ?? 0);

  async function handleRestoreVariable(
    variableId: Id<"environmentVariables">,
    key: string
  ) {
    setRestoringId(variableId);
    try {
      await restoreVariable({ variableId });
      toast.success(`Restored ${key}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore variable"
      );
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreAccount(
    accountId: Id<"projectAccounts">,
    name: string
  ) {
    if (!convexUserId) return;
    setRestoringId(accountId);
    try {
      await restoreAccount({
        accountId,
        restoredBy: convexUserId as Id<"users">,
      });
      toast.success(`Restored ${name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore account"
      );
    } finally {
      setRestoringId(null);
    }
  }

  async function handleEmptyTrash() {
    if (!projectId) return;
    setEmptying(true);
    try {
      const result = await emptyTrash({ projectId });
      const purged = result.purgedVariables + result.purgedAccounts;
      if (result.skipped > 0) {
        toast.warning(
          `Permanently deleted ${purged} item${purged === 1 ? "" : "s"}; ${result.skipped} could not be purged and will be retried automatically.`
        );
      } else {
        toast.success(
          `Trash emptied — ${purged} item${purged === 1 ? "" : "s"} permanently deleted.`
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to empty trash");
    } finally {
      setEmptying(false);
    }
  }

  if (project === null) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-zinc-500">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/projects/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name ?? "project"}
        </Link>
        <div className="mt-4 flex items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              <Trash2 className="h-6 w-6 text-zinc-400" />
              Trash
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Deleted items stay restorable for {RETENTION_DAYS} days, then they
              are destroyed permanently.
            </p>
          </div>
          {canEmpty && totalCount > 0 && (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={emptying}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400"
            >
              {emptying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {emptying ? "Emptying…" : "Empty trash"}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"
              />
            ))}
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Trash2 className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <h2 className="mt-4 font-semibold text-zinc-900 dark:text-zinc-100">
            Trash is empty
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Deleted variables and shared accounts will appear here for{" "}
            {RETENTION_DAYS} days before being permanently destroyed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {deletedVariables && deletedVariables.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <KeyRound className="h-4 w-4 text-zinc-400" />
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Variables
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {deletedVariables.length}
                </span>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {deletedVariables.map((variable) => (
                  <div
                    key={variable._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <code className="font-mono text-sm font-semibold text-zinc-500 line-through dark:text-zinc-400">
                        {variable.key}
                      </code>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                        Deleted {pluralDays(daysAgo(variable.deletedAt))} ago
                        {" — "}
                        <span
                          className={
                            daysLeft(variable.deletedAt) <= 1
                              ? "font-medium text-red-500"
                              : ""
                          }
                        >
                          {pluralDays(daysLeft(variable.deletedAt))} left
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleRestoreVariable(variable._id, variable.key)
                      }
                      disabled={restoringId === variable._id || emptying}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {restoringId === variable._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {deletedAccounts && deletedAccounts.length > 0 && (
            <section className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center gap-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <UserRound className="h-4 w-4 text-zinc-400" />
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Shared accounts
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {deletedAccounts.length}
                </span>
              </div>
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {deletedAccounts.map((account) => (
                  <div
                    key={account._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <span className="text-sm font-semibold text-zinc-500 line-through dark:text-zinc-400">
                        {account.name}
                      </span>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-500">
                        Deleted {pluralDays(daysAgo(account.deletedAt))} ago
                        {" — "}
                        <span
                          className={
                            daysLeft(account.deletedAt) <= 1
                              ? "font-medium text-red-500"
                              : ""
                          }
                        >
                          {pluralDays(daysLeft(account.deletedAt))} left
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleRestoreAccount(account._id, account.name)
                      }
                      disabled={restoringId === account._id || emptying}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      {restoringId === account._id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void handleEmptyTrash();
        }}
        title="Empty Trash"
        message={`Permanently delete all ${totalCount} item${totalCount === 1 ? "" : "s"} in the trash? Their secret values are destroyed in the vault immediately. This cannot be undone.`}
        confirmText="Empty trash"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
}
