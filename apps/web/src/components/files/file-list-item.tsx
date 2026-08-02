"use client";

import { useState } from "react";
import {
  Download,
  FileKey,
  Loader2,
  Lock,
  Pencil,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
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
  const [showDetails, setShowDetails] = useState(false);

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  const isWritable = file.access === "write";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FileKey className="h-4 w-4 shrink-0 text-green-600 dark:text-green-500" />
            <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
              {file.name}
            </span>
            {!isWritable && (
              <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                <Lock className="h-3 w-3" />
                read-only
              </span>
            )}
          </div>

          {/* The path IS the feature — it is what makes a pulled file land in
              the right place without anyone remembering where it goes. */}
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="mt-1 block max-w-full truncate text-left font-mono text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            title={file.path}
          >
            {file.path}
          </button>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {file.environments.map((env) => (
              <span
                key={env}
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${envBadgeClasses(env)}`}
              >
                {env}
              </span>
            ))}
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {formatBytes(file.size)}
            </span>
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {file.mode}
            </span>
          </div>

          {showDetails && (
            <dl className="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-xs dark:border-zinc-800">
              {file.description && (
                <div className="flex gap-2">
                  <dt className="shrink-0 text-zinc-500">Description</dt>
                  <dd className="text-zinc-700 dark:text-zinc-300">
                    {file.description}
                  </dd>
                </div>
              )}
              <div className="flex gap-2">
                <dt className="shrink-0 text-zinc-500">Checksum</dt>
                {/* Salted digest of the plaintext. Clients compare their local
                    copy against this without ever decrypting anything. */}
                <dd className="truncate font-mono text-zinc-700 dark:text-zinc-300">
                  {file.sha256.slice(0, 24)}…
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="shrink-0 text-zinc-500">Version</dt>
                <dd className="text-zinc-700 dark:text-zinc-300">
                  v{file.version} · updated {formatDate(file.updatedAt)}
                </dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onDownload}
            disabled={isDownloading}
            title="Download (audited)"
            aria-label={`Download ${file.name}`}
            className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
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
                type="button"
                onClick={onReplace}
                title="Replace contents"
                aria-label={`Replace ${file.name}`}
                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onEdit}
                title="Edit details"
                aria-label={`Edit ${file.name}`}
                className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}

          {canManagePermissions && (
            <button
              type="button"
              onClick={onManagePermissions}
              title="Manage access"
              aria-label={`Manage access for ${file.name}`}
              className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <Users className="h-4 w-4" />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              title="Move to trash"
              aria-label={`Delete ${file.name}`}
              className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
