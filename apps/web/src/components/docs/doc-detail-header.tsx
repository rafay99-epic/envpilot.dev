"use client";

import { GitPullRequest, Pencil, Send, Share2, Trash2 } from "lucide-react";

import { DocStatusPill } from "@/components/docs";
import { formatDate } from "@/lib/format";

/**
 * Title, meta line and the action row for a single documentation page.
 *
 * One header block, not two: the title used to render twice while editing, a
 * static h1 plus the edit input. The input IS the title, and the rest is one
 * meta line.
 */
export function DocDetailHeader({
  doc,
  isEditing,
  isBusy,
  draftTitle,
  timeZone,
  canOpenShare,
  onTitleChange,
  onBeginEdit,
  onCancelEdit,
  onSave,
  onPublish,
  onUnpublish,
  onShare,
  onDelete,
}: {
  doc: {
    title: string;
    module: string;
    authorName: string;
    updatedAt: number;
    status: "draft" | "published";
    prUrl?: string;
    canEdit?: boolean;
    canPublish?: boolean;
    canDelete?: boolean;
  };
  isEditing: boolean;
  isBusy: boolean;
  draftTitle: string;
  timeZone: string;
  canOpenShare: boolean;
  onTitleChange: (title: string) => void;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const hasActions =
    doc.canEdit || doc.canPublish || doc.canDelete || canOpenShare;

  return (
    <div
      className={`flex shrink-0 items-start justify-between gap-4 ${
        isEditing ? "mx-auto w-full max-w-[920px] px-4" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <input
              value={draftTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              maxLength={200}
              data-testid="doc-title-edit"
              aria-label="Page title"
              placeholder="Page title"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-bold text-ink outline-none placeholder:text-ink-subtle"
            />
          ) : (
            <h1
              data-testid="doc-title"
              className="min-w-0 truncate text-2xl font-bold text-ink"
            >
              {doc.title}
            </h1>
          )}
          <DocStatusPill status={doc.status} />
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-subtle">
          <span className="text-ink-muted">{doc.module}</span>
          <span aria-hidden>·</span>
          <span>{doc.authorName}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(doc.updatedAt, timeZone)}</span>
          {doc.prUrl && (
            <>
              <span aria-hidden>·</span>
              <a
                href={doc.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                <GitPullRequest className="h-3 w-3" />
                Pull request
              </a>
            </>
          )}
        </p>
      </div>

      {hasActions && (
        <div className="flex shrink-0 items-center gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={isBusy}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="doc-save"
                onClick={onSave}
                disabled={isBusy}
                className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-ink-muted disabled:opacity-50"
              >
                {isBusy ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <>
              {canOpenShare && doc.status === "published" && (
                <button
                  type="button"
                  data-testid="doc-share"
                  onClick={onShare}
                  title="Share this page"
                  aria-label="Share this page"
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
              {doc.canDelete && (
                <button
                  type="button"
                  data-testid="doc-delete"
                  onClick={onDelete}
                  title="Move to trash"
                  aria-label="Move to trash"
                  className="rounded-lg p-2 text-ink-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {doc.canEdit && (
                <button
                  type="button"
                  data-testid="doc-edit"
                  onClick={onBeginEdit}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
              {doc.canPublish &&
                (doc.status === "draft" ? (
                  <button
                    type="button"
                    data-testid="doc-publish"
                    onClick={onPublish}
                    disabled={isBusy}
                    className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-ink-inverse transition-colors hover:bg-ink-muted disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Publish
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="doc-unpublish"
                    onClick={onUnpublish}
                    disabled={isBusy}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Return to draft
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
