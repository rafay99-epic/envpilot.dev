"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

interface RecentlyDeletedProps {
  projectId: Id<"projects">;
  userId: Id<"users"> | undefined;
}

// Mirrors PURGE_RETENTION_DAYS in convex/vaultGc.ts. Duplicated here because
// that module pulls in server-only Convex runtime code (mutations, crons)
// that must not end up in the client bundle — the getDeleted queries already
// exclude anything past the window, this is only used for the countdown copy.
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

/**
 * Collapsed-by-default "Recently deleted" section for a project: lists
 * soft-deleted variables and shared accounts that are still within the
 * 7-day restore window (see variables.restore / accounts.restore) and lets
 * an authorized user (owner / assigned PM / team lead) restore them.
 *
 * Renders nothing while loading, when there's nothing to show, or when the
 * caller lacks access — getDeleted returns [] in both the "no access" and
 * "nothing deleted" cases, so there's no separate access check here.
 */
export function RecentlyDeleted({ projectId, userId }: RecentlyDeletedProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const deletedVariables = useQuery(
    api.variables.getDeleted,
    userId ? { projectId, userId } : "skip"
  );
  const deletedAccounts = useQuery(
    api.accounts.getDeleted,
    userId ? { projectId, userId } : "skip"
  );

  const restoreVariable = useMutation(api.variables.restore);
  const restoreAccount = useMutation(api.accounts.restore);

  if (deletedVariables === undefined || deletedAccounts === undefined) {
    return null;
  }

  if (deletedVariables.length === 0 && deletedAccounts.length === 0) {
    return null;
  }

  const totalCount = deletedVariables.length + deletedAccounts.length;

  async function handleRestoreVariable(
    variableId: Id<"environmentVariables">,
    key: string
  ) {
    if (!userId) return;
    setRestoringId(variableId);
    try {
      await restoreVariable({ variableId, restoredBy: userId });
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
    if (!userId) return;
    setRestoringId(accountId);
    try {
      await restoreAccount({ accountId, restoredBy: userId });
      toast.success(`Restored ${name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore account"
      );
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-zinc-400" />
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Recently deleted
          </h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {totalCount}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      {isOpen && (
        <div className="divide-y divide-zinc-200 border-t border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {deletedVariables.map((variable) => (
            <div
              key={variable._id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0 flex-1">
                <code className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {variable.key}
                </code>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Deleted {pluralDays(daysAgo(variable.deletedAt))} ago —{" "}
                  {pluralDays(daysLeft(variable.deletedAt))} left
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  handleRestoreVariable(variable._id, variable.key)
                }
                disabled={restoringId === variable._id}
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
          {deletedAccounts.map((account) => (
            <div
              key={account._id}
              className="flex items-center justify-between gap-4 px-6 py-3"
            >
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {account.name}
                </span>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Deleted {pluralDays(daysAgo(account.deletedAt))} ago —{" "}
                  {pluralDays(daysLeft(account.deletedAt))} left
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestoreAccount(account._id, account.name)}
                disabled={restoringId === account._id}
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
      )}
    </div>
  );
}
