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
  BookText,
  FileKey,
} from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useProjectBySlug, useConvexUser } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { ConfirmDialog } from "@/components/ui";

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
  const { organization, user, capabilities } = useAuthContext();
  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  // Direct by-slug lookup — no dependency on the full project list (and on
  // convexUserId resolving first) just to find one project.
  const project = useProjectBySlug(orgId, slug);
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

  const deletedFiles = useQuery(
    api.features.files.queries.getDeleted,
    projectId && convexUserId ? { projectId } : "skip"
  );

  // Trashed docs are listed by the docs feature itself: unlike variables and
  // accounts they carry no vault object, so they are not part of the vault
  // sweep and have their own purge cron.
  const deletedDocs = useQuery(
    api.features.docs.queries.listTrashed,
    projectId && convexUserId ? { projectId } : "skip"
  );

  const restoreVariable = useMutation(api.features.variables.mutations.restore);
  const restoreAccount = useMutation(api.features.accounts.mutations.restore);
  const restoreFile = useMutation(api.features.files.mutations.restore);
  const restoreDoc = useMutation(api.features.docs.mutations.restore);
  const emptyTrash = useAction(api.features.vault.gc.emptyProjectTrash);

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Empty-trash mirrors the variable-deletion capability from the caller's
  // resolved registry profile. The server re-checks; this only hides the
  // button.
  const canEmpty = capabilities["project.variables.delete"] === true;

  const loading =
    project === undefined ||
    deletedVariables === undefined ||
    deletedAccounts === undefined ||
    deletedFiles === undefined ||
    deletedDocs === undefined;

  const totalCount =
    (deletedVariables?.length ?? 0) +
    (deletedAccounts?.length ?? 0) +
    (deletedFiles?.length ?? 0) +
    (deletedDocs?.length ?? 0);

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

  async function handleRestoreFile(fileId: Id<"projectFiles">, name: string) {
    setRestoringId(fileId);
    try {
      await restoreFile({ fileId });
      toast.success(`Restored ${name}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore file"
      );
    } finally {
      setRestoringId(null);
    }
  }

  async function handleRestoreDoc(docId: Id<"docs">, title: string) {
    setRestoringId(docId);
    try {
      await restoreDoc({ docId });
      // Always comes back as a draft — nothing has reviewed it since it was
      // deleted, so it must not reappear readable to the team.
      toast.success(`Restored ${title} as a draft`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to restore page"
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
      const purged =
        result.purgedVariables +
        result.purgedAccounts +
        result.purgedFiles +
        result.purgedDocs;
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
        <p className="text-sm text-ink-subtle">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/projects/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {project?.name ?? "project"}
        </Link>
        <div className="mt-4">
          <PageHeader
            icon={Trash2}
            title="Trash"
            description={`Deleted items stay restorable for ${RETENTION_DAYS} days, then they are destroyed permanently.`}
            actions={
              canEmpty && totalCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={emptying}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-50 text-danger"
                >
                  {emptying ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {emptying ? "Emptying…" : "Empty trash"}
                </button>
              ) : undefined
            }
          />
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="rounded-xl border border-line bg-white p-6 border-line bg-surface">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-surface-raised"
              />
            ))}
          </div>
        </div>
      ) : totalCount === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-16 text-center border-line bg-surface">
          <Trash2 className="mx-auto h-10 w-10 text-ink-faint" />
          <h2 className="mt-4 font-semibold text-ink">Trash is empty</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Deleted variables and shared accounts will appear here for{" "}
            {RETENTION_DAYS} days before being permanently destroyed.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {deletedVariables && deletedVariables.length > 0 && (
            <section className="rounded-xl border border-line bg-white border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-6 py-4 border-line">
                <KeyRound className="h-4 w-4 text-ink-muted" />
                <h2 className="font-semibold text-ink">Variables</h2>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-faint bg-surface-raised text-ink-muted">
                  {deletedVariables.length}
                </span>
              </div>
              <div className="divide-y divide-line">
                {deletedVariables.map((variable) => (
                  <div
                    key={variable._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <code className="font-mono text-sm font-semibold text-ink-subtle line-through text-ink-muted">
                        {variable.key}
                      </code>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Deleted {pluralDays(daysAgo(variable.deletedAt))} ago
                        {" — "}
                        <span
                          className={
                            daysLeft(variable.deletedAt) <= 1
                              ? "font-medium text-danger"
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
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-faint shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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
            <section className="rounded-xl border border-line bg-white border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-6 py-4 border-line">
                <UserRound className="h-4 w-4 text-ink-muted" />
                <h2 className="font-semibold text-ink">Shared accounts</h2>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-faint bg-surface-raised text-ink-muted">
                  {deletedAccounts.length}
                </span>
              </div>
              <div className="divide-y divide-line">
                {deletedAccounts.map((account) => (
                  <div
                    key={account._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <span className="text-sm font-semibold text-ink-subtle line-through text-ink-muted">
                        {account.name}
                      </span>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Deleted {pluralDays(daysAgo(account.deletedAt))} ago
                        {" — "}
                        <span
                          className={
                            daysLeft(account.deletedAt) <= 1
                              ? "font-medium text-danger"
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
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-faint shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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

          {deletedFiles && deletedFiles.length > 0 && (
            <section className="rounded-xl border border-line bg-white border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-6 py-4 border-line">
                <FileKey className="h-4 w-4 text-ink-muted" />
                <h2 className="font-semibold text-ink">Secret files</h2>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-faint bg-surface-raised text-ink-muted">
                  {deletedFiles.length}
                </span>
              </div>
              <div className="divide-y divide-line">
                {deletedFiles.map((file) => (
                  <div
                    key={file._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <span className="text-sm font-semibold text-ink-subtle line-through text-ink-muted">
                        {file.name}
                      </span>
                      <p className="truncate font-mono text-xs text-ink-subtle">
                        {file.path}
                      </p>
                      <p className="mt-1 text-xs text-ink-subtle">
                        Deleted {pluralDays(daysAgo(file.deletedAt))} ago
                        {" — "}
                        <span
                          className={
                            daysLeft(file.deletedAt) <= 1
                              ? "font-medium text-danger"
                              : ""
                          }
                        >
                          {pluralDays(daysLeft(file.deletedAt))} left
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreFile(file._id, file.name)}
                      disabled={restoringId === file._id || emptying}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-faint shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
                    >
                      {restoringId === file._id ? (
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

          {deletedDocs && deletedDocs.length > 0 && (
            <section className="rounded-xl border border-line bg-white border-line bg-surface">
              <div className="flex items-center gap-2 border-b border-line px-6 py-4 border-line">
                <BookText className="h-4 w-4 text-ink-muted" />
                <h2 className="font-semibold text-ink">Documentation</h2>
                <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-faint bg-surface-raised text-ink-muted">
                  {deletedDocs.length}
                </span>
              </div>
              <div className="divide-y divide-line">
                {deletedDocs.map((doc) => (
                  <div
                    key={doc._id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="min-w-0 flex-1 opacity-60">
                      <span className="text-sm font-semibold text-ink-subtle line-through text-ink-muted">
                        {doc.title}
                      </span>
                      <p className="truncate font-mono text-xs text-ink-subtle">
                        {doc.module}
                      </p>
                      {doc.deletedAt !== undefined && (
                        <p className="mt-1 text-xs text-ink-subtle">
                          Deleted {pluralDays(daysAgo(doc.deletedAt))} ago
                          {" — "}
                          <span
                            className={
                              daysLeft(doc.deletedAt) <= 1
                                ? "font-medium text-danger"
                                : ""
                            }
                          >
                            {pluralDays(daysLeft(doc.deletedAt))} left
                          </span>
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestoreDoc(doc._id, doc.title)}
                      disabled={restoringId === doc._id || emptying}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink-faint shadow-sm transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
                    >
                      {restoringId === doc._id ? (
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
