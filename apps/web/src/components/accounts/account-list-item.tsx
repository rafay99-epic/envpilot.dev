"use client";

import { useState } from "react";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  Share2,
  ExternalLink,
} from "lucide-react";
import type { Account } from "@/hooks";
import { isSafeHttpUrl } from "@/lib/account-payload";
import type { AccountVaultPayload } from "@/lib/account-payload";

interface AccountListItemProps {
  account: Account;
  onEdit?: () => void;
  onDelete?: () => void;
  onManagePermissions?: () => void;
  onShare?: () => void;
  onReveal?: () => void;
  revealedValue?: AccountVaultPayload | null;
  isRevealing?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManagePermissions?: boolean;
  permissionLevel?: "read" | "write" | null;
}

function envBadgeClasses(env: string): string {
  return env === "production"
    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
    : env === "staging"
      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
}

export function AccountListItem({
  account,
  onEdit,
  onDelete,
  onManagePermissions,
  onShare,
  onReveal,
  revealedValue,
  isRevealing = false,
  canEdit = false,
  canDelete = false,
  canManagePermissions = false,
  permissionLevel,
}: AccountListItemProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedField, setCopiedField] = useState<
    "username" | "password" | null
  >(null);

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  const handleToggleReveal = () => {
    if (!revealedValue && !isRevealing && onReveal) {
      onReveal();
      setIsVisible(true);
    } else {
      setIsVisible((prev) => {
        // Re-mask the password whenever the block is hidden, so a prior unmask
        // doesn't persist into the next reveal (credentials should default to
        // masked every time they reappear).
        if (prev) setShowPassword(false);
        return !prev;
      });
    }
  };

  const handleCopy = async (field: "username" | "password", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Fallback for older browsers — no-op
    }
  };

  const safeUrl =
    account.websiteUrl && isSafeHttpUrl(account.websiteUrl)
      ? account.websiteUrl
      : null;

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {account.name}
              </span>
              {safeUrl && (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  title={safeUrl}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span className="max-w-[200px] truncate">{safeUrl}</span>
                </a>
              )}
              {permissionLevel && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    permissionLevel === "write"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  }`}
                >
                  {permissionLevel}
                </span>
              )}
            </div>
            {account.description && (
              <p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-400">
                {account.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {account.environments.map((env) => (
                  <span
                    key={env}
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${envBadgeClasses(env)}`}
                  >
                    {env}
                  </span>
                ))}
              </div>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Updated {formatDate(account.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onReveal && account.hasAccess && (
            <button
              onClick={handleToggleReveal}
              disabled={isRevealing}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title={
                isVisible && revealedValue
                  ? "Hide credentials"
                  : "Reveal credentials"
              }
            >
              {isRevealing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isVisible && revealedValue ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              title="Share account"
            >
              <Share2 className="h-4 w-4" />
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
              title="Edit account"
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
              title="Delete account"
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

      {/* Revealed credentials */}
      {isVisible && revealedValue && (
        <div className="mt-2 space-y-2 rounded-lg bg-zinc-100 px-3 py-2.5 dark:bg-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Username
              </span>
              <code className="block break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {revealedValue.username}
              </code>
            </div>
            <button
              onClick={() => handleCopy("username", revealedValue.username)}
              className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              title={copiedField === "username" ? "Copied!" : "Copy username"}
            >
              {copiedField === "username" ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                Password
              </span>
              <code className="block break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {showPassword
                  ? revealedValue.password
                  : "•".repeat(Math.min(revealedValue.password.length, 24))}
              </code>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setShowPassword((prev) => !prev)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => handleCopy("password", revealedValue.password)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                title={copiedField === "password" ? "Copied!" : "Copy password"}
              >
                {copiedField === "password" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
