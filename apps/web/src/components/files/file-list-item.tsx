"use client";

import { Download, Loader2, Pencil, Trash2, Upload, Users } from "lucide-react";
import { formatBytes, type SecretFile } from "@/hooks/useSecretFiles";

interface FileListItemProps {
  file: SecretFile;
  onDownload?: () => void;
  onReplace?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePermissions?: () => void;
  isDownloading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManagePermissions?: boolean;
}

/** Same environment palette the variables and accounts rows use. */
function envBadgeClasses(env: string): string {
  return env === "production"
    ? "bg-danger-soft text-danger bg-danger-soft text-danger"
    : env === "staging"
      ? "bg-warning-soft text-warning bg-warning-soft text-warning"
      : "bg-accent-soft text-accent-hover bg-accent-soft text-accent";
}

export function FileListItem({
  file,
  onDownload,
  onReplace,
  onEdit,
  onDelete,
  onManagePermissions,
  isDownloading = false,
  canEdit = false,
  canDelete = false,
  canManagePermissions = false,
}: FileListItemProps) {
  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  const isWritable = file.access === "write";

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-ink">
                {file.name}
              </span>
              {/* The destination path is the feature — mono, like the
                  account row treats its URL. */}
              <span
                className="max-w-full truncate font-mono text-xs text-ink-subtle sm:max-w-[280px] text-ink-muted"
                title={file.path}
              >
                {file.path}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isWritable
                    ? "bg-warning-soft text-warning bg-warning-soft text-warning"
                    : "bg-info-soft text-info bg-info-soft text-info"
                }`}
              >
                {file.access}
              </span>
            </div>

            {file.description && (
              <p className="mt-1 truncate text-sm text-ink-muted">
                {file.description}
              </p>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {file.environments.map((env) => (
                  <span
                    key={env}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${envBadgeClasses(env)}`}
                  >
                    {env}
                  </span>
                ))}
              </div>
              <span className="font-mono text-xs text-ink-subtle">
                {formatBytes(file.size)} · {file.mode}
              </span>
              <span className="text-xs text-ink-subtle">
                Updated {formatDate(file.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:shrink-0">
          <button
            onClick={onDownload}
            disabled={isDownloading}
            aria-label={`Download ${file.name}`}
            title="Download (audited)"
            className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-faint disabled:opacity-50 hover:bg-surface-hover hover:text-ink-muted"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </button>

          {canEdit && isWritable && (
            <>
              <button
                onClick={onReplace}
                aria-label={`Replace ${file.name}`}
                title="Replace contents"
                className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-faint hover:bg-surface-hover hover:text-ink-muted"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                onClick={onEdit}
                aria-label={`Edit ${file.name}`}
                title="Edit details"
                className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-faint hover:bg-surface-hover hover:text-ink-muted"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}

          {canManagePermissions && (
            <button
              onClick={onManagePermissions}
              aria-label={`Manage access for ${file.name}`}
              title="Manage access"
              className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-faint hover:bg-surface-hover hover:text-ink-muted"
            >
              <Users className="h-4 w-4" />
            </button>
          )}

          {canDelete && (
            <button
              onClick={onDelete}
              aria-label={`Delete ${file.name}`}
              title="Move to trash"
              className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
