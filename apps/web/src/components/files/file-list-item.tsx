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
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : env === "staging"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
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
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {file.name}
              </span>
              {/* The destination path is the feature — mono, like the
                  account row treats its URL. */}
              <span
                className="max-w-full truncate font-mono text-xs text-zinc-500 sm:max-w-[280px] dark:text-zinc-400"
                title={file.path}
              >
                {file.path}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isWritable
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                }`}
              >
                {file.access}
              </span>
            </div>

            {file.description && (
              <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
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
              <span className="font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {formatBytes(file.size)} · {file.mode}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
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
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                onClick={onEdit}
                aria-label={`Edit ${file.name}`}
                title="Edit details"
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
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
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            >
              <Users className="h-4 w-4" />
            </button>
          )}

          {canDelete && (
            <button
              onClick={onDelete}
              aria-label={`Delete ${file.name}`}
              title="Move to trash"
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
