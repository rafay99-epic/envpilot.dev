"use client";

import { useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { Eye, EyeOff, Copy, Check, Loader2 } from "lucide-react";

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  updatedAt: number;
}

interface VariableListItemProps {
  variable: Variable;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewHistory?: () => void;
  onManagePermissions?: () => void;
  onReveal?: () => void;
  revealedValue?: string | null;
  isRevealing?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManagePermissions?: boolean;
  permissionLevel?: "read" | "write" | "admin" | null;
}

export function VariableListItem({
  variable,
  onEdit,
  onDelete,
  onViewHistory,
  onManagePermissions,
  onReveal,
  revealedValue,
  isRevealing = false,
  canEdit = false,
  canDelete = false,
  canManagePermissions = false,
  permissionLevel,
}: VariableListItemProps) {
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));
  };

  const handleToggleReveal = () => {
    if (!revealedValue && !isRevealing && onReveal) {
      onReveal();
      setIsValueVisible(true);
    } else {
      setIsValueVisible(!isValueVisible);
    }
  };

  const handleCopy = async () => {
    if (!revealedValue) return;
    try {
      await navigator.clipboard.writeText(`${variable.key}=${revealedValue}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <code className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {variable.key}
            </code>
            {variable.isSensitive && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                Sensitive
              </span>
            )}
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              v{variable.version}
            </span>
            {permissionLevel && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  permissionLevel === "admin"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    : permissionLevel === "write"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                }`}
              >
                {permissionLevel}
              </span>
            )}
          </div>
          {variable.description && (
            <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
              {variable.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <div className="flex flex-wrap gap-1">
              {variable.environments.map((env) => (
                <span
                  key={env}
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    env === "production"
                      ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : env === "staging"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  }`}
                >
                  {env}
                </span>
              ))}
            </div>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              Updated {formatDate(variable.updatedAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onReveal && (
            <button
              onClick={handleToggleReveal}
              disabled={isRevealing}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title={
                isValueVisible && revealedValue ? "Hide value" : "Reveal value"
              }
            >
              {isRevealing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isValueVisible && revealedValue ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          {revealedValue && (
            <button
              onClick={handleCopy}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title={copied ? "Copied!" : "Copy key=value"}
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          )}
          {onViewHistory && (
            <button
              onClick={onViewHistory}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="View history"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </button>
          )}
          {canManagePermissions && onManagePermissions && (
            <button
              onClick={onManagePermissions}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Manage access permissions"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                />
              </svg>
            </button>
          )}
          {canEdit && onEdit && (
            <button
              onClick={onEdit}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Edit variable"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
              </svg>
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title="Delete variable"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Revealed value display */}
      {isValueVisible && revealedValue && (
        <div className="mt-2 rounded-lg bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
          <code className="break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
            {revealedValue}
          </code>
        </div>
      )}
    </div>
  );
}
