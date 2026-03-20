"use client";

import { useState } from "react";
import { Link2, Eye, Clock, X, Shield, Loader2 } from "lucide-react";
import { useRevokeShare } from "@/hooks/useShareSecret";

interface ShareRecipient {
  email: string;
  hasViewed: boolean;
  viewedAt?: number;
  otpVerified: boolean;
}

interface ShareItem {
  _id: string;
  mode: "one_time" | "time_limited";
  status: "active" | "burned" | "expired" | "revoked";
  expiresAt: number;
  totalViewCount: number;
  createdAt: number;
  recipients: ShareRecipient[];
}

interface ActiveSharesListProps {
  shares: ShareItem[];
  onRefresh?: () => void;
}

export function ActiveSharesList({ shares, onRefresh }: ActiveSharesListProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const revokeShare = useRevokeShare();

  if (shares.length === 0) return null;

  const handleRevoke = async (shareId: string) => {
    if (!confirm("Are you sure you want to revoke this share link? Recipients will no longer be able to access the secret.")) {
      return;
    }
    setRevokingId(shareId);
    setRevokeError(null);
    try {
      await revokeShare.mutateAsync(shareId);
      onRefresh?.();
    } catch (err) {
      setRevokeError(
        err instanceof Error ? err.message : "Failed to revoke share"
      );
    } finally {
      setRevokingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            Active
          </span>
        );
      case "burned":
        return (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Viewed
          </span>
        );
      case "expired":
        return (
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            Expired
          </span>
        );
      case "revoked":
        return (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Revoked
          </span>
        );
      default:
        return null;
    }
  };

  const getTimeRemaining = (expiresAt: number) => {
    const diff = expiresAt - Date.now();
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <Shield className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Shared Links ({shares.length})
        </span>
      </div>
      {revokeError && (
        <div className="border-b border-zinc-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-zinc-800 dark:bg-red-900/20 dark:text-red-400">
          {revokeError}
        </div>
      )}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {shares.map((share) => (
          <div key={share._id} className="flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {share.mode === "one_time" ? (
                  <Eye className="h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                )}
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  {share.mode === "one_time" ? "One-time" : "Time-limited"}
                </span>
              </div>
              {getStatusBadge(share.status)}
              {share.status === "active" && (
                <span className="text-xs text-zinc-400">
                  {getTimeRemaining(share.expiresAt)}
                </span>
              )}
              <span className="text-xs text-zinc-400">
                {share.totalViewCount} view{share.totalViewCount !== 1 ? "s" : ""}
              </span>
            </div>
            {share.status === "active" && (
              <button
                onClick={() => handleRevoke(share._id)}
                disabled={revokingId === share._id}
                className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                title="Revoke share"
              >
                {revokingId === share._id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
