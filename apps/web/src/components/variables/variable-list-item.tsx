"use client";

import { useState, type ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { Eye, EyeOff, Copy, Check, Loader2, Share2, Boxes } from "lucide-react";
import { TagBadge } from "./tag-badge";
import { formatDateTimeShort } from "@/lib/format";
import { useTimeZone } from "@/hooks/useTimeZone";

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  updatedAt: number;
  tags?: Array<{ _id: string; name: string; color: string }>;
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
  permissionLevel?: "read" | "write" | null;
  onShare?: () => void;
  activeShareCount?: number;
  showCheckbox?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  /** Extra pills beside the key: reach count, duplicate-key hint. */
  badge?: ReactNode;
  onShareAcross?: () => void;
  /** Replaces edit and delete with this text when the caller may not write. */
  readOnlyLabel?: string;
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
  onShare,
  activeShareCount,
  showCheckbox = false,
  isSelected = false,
  onToggleSelect,
  badge,
  onShareAcross,
  readOnlyLabel,
}: VariableListItemProps) {
  const [isValueVisible, setIsValueVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeZone = useTimeZone();

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
    <div
      className={`px-6 py-4 ${isSelected ? "bg-accent-soft border-l-2 border-accent-line" : ""}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {showCheckbox && (
            <div className="mt-1 flex items-center">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={onToggleSelect}
                aria-label={`Select ${variable.key}`}
                className="h-4 w-4 cursor-pointer"
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <code className="font-mono text-sm font-semibold text-ink">
                {variable.key}
              </code>
              {badge}
              {variable.isSensitive && (
                <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                  Sensitive
                </span>
              )}
              <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-surface-raised text-ink-muted">
                v{variable.version}
              </span>
              {permissionLevel && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    permissionLevel === "write"
                      ? "bg-warning-soft text-warning"
                      : "bg-info-soft text-info"
                  }`}
                >
                  {permissionLevel}
                </span>
              )}
            </div>
            {variable.description && (
              <p className="mt-1 truncate text-sm text-ink-muted">
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
                        ? "bg-danger-soft text-danger"
                        : env === "staging"
                          ? "bg-warning-soft text-warning"
                          : "bg-accent-soft text-accent"
                    }`}
                  >
                    {env}
                  </span>
                ))}
                {variable.tags?.map((tag) => (
                  <TagBadge key={tag._id} name={tag.name} color={tag.color} />
                ))}
              </div>
              <span className="text-xs text-ink-subtle">
                Updated {formatDateTimeShort(variable.updatedAt, timeZone)}
              </span>
            </div>
          </div>
        </div>

        <RowActions
          variable={variable}
          revealState={
            isRevealing
              ? "revealing"
              : isValueVisible && revealedValue
                ? "shown"
                : "hidden"
          }
          revealedValue={revealedValue}
          copied={copied}
          onToggleReveal={onReveal ? handleToggleReveal : undefined}
          onCopy={handleCopy}
          onShare={onShare}
          activeShareCount={activeShareCount}
          onShareAcross={onShareAcross}
          onViewHistory={onViewHistory}
          onManagePermissions={
            canManagePermissions ? onManagePermissions : undefined
          }
          readOnlyLabel={readOnlyLabel}
          onEdit={!readOnlyLabel && canEdit ? onEdit : undefined}
          onDelete={!readOnlyLabel && canDelete ? onDelete : undefined}
        />
      </div>

      {/* Revealed value display */}
      {isValueVisible && revealedValue && (
        <div className="mt-2 rounded-lg px-3 py-2 bg-surface-raised">
          <code className="break-all font-mono text-xs text-ink-muted">
            {revealedValue}
          </code>
        </div>
      )}
    </div>
  );
}

type RevealState = "revealing" | "shown" | "hidden";

type RowActionsProps = Pick<
  VariableListItemProps,
  | "variable"
  | "revealedValue"
  | "onShare"
  | "activeShareCount"
  | "onShareAcross"
  | "onViewHistory"
  | "onManagePermissions"
  | "readOnlyLabel"
  | "onEdit"
  | "onDelete"
> & {
  revealState: RevealState;
  copied: boolean;
  onToggleReveal: (() => void) | undefined;
  onCopy: () => void;
};

// Each callback is only passed when the action is allowed, so this renders
// what it is given and never re-derives permissions.
function RowActions({
  variable,
  revealState,
  revealedValue,
  copied,
  onToggleReveal,
  onCopy,
  onShare,
  activeShareCount,
  onShareAcross,
  onViewHistory,
  onManagePermissions,
  readOnlyLabel,
  onEdit,
  onDelete,
}: RowActionsProps) {
  return (
    <div className="flex items-center gap-1">
      <RevealActions
        revealState={revealState}
        revealedValue={revealedValue}
        copied={copied}
        onToggleReveal={onToggleReveal}
        onCopy={onCopy}
      />
      {onShare && (
        <button
          onClick={onShare}
          className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
          title="Share via secure link"
        >
          <Share2 className="h-4 w-4" />
          {activeShareCount !== undefined && activeShareCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-accent" />
          )}
        </button>
      )}
      {onShareAcross && (
        <button
          onClick={onShareAcross}
          aria-label={`Share ${variable.key} across projects`}
          title="Share across projects"
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
        >
          <Boxes className="h-4 w-4" />
        </button>
      )}
      {onViewHistory && (
        <button
          onClick={onViewHistory}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
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
      {onManagePermissions && (
        <button
          onClick={onManagePermissions}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
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
      {readOnlyLabel && (
        <span className="px-2 text-xs text-ink-subtle">{readOnlyLabel}</span>
      )}
      {onEdit && (
        <button
          onClick={onEdit}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
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
      {onDelete && (
        <button
          onClick={onDelete}
          className="rounded-lg p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
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
  );
}

function RevealActions({
  revealState,
  revealedValue,
  copied,
  onToggleReveal,
  onCopy,
}: Pick<
  RowActionsProps,
  "revealState" | "revealedValue" | "copied" | "onToggleReveal" | "onCopy"
>) {
  return (
    <>
      {onToggleReveal && (
        <button
          onClick={onToggleReveal}
          disabled={revealState === "revealing"}
          className="rounded-lg p-2 text-ink-muted disabled:opacity-50 hover:bg-surface-hover hover:text-ink-muted"
          title={revealState === "shown" ? "Hide value" : "Reveal value"}
        >
          {revealState === "revealing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : revealState === "shown" ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      )}
      {revealedValue && (
        <button
          onClick={onCopy}
          className="rounded-lg p-2 text-ink-muted hover:bg-surface-hover hover:text-ink-muted"
          title={copied ? "Copied!" : "Copy key=value"}
        >
          {copied ? (
            <Check className="h-4 w-4 text-accent" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      )}
    </>
  );
}
