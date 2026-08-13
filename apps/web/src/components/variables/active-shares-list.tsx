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
    if (
      !confirm(
        "Are you sure you want to revoke this share link? Recipients will no longer be able to access the secret."
      )
    ) {
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
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-hover bg-accent-soft text-accent">
            Active
          </span>
        );
      case "burned":
        return (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning bg-warning-soft text-warning">
            Viewed
          </span>
        );
      case "expired":
        return (
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-subtle bg-surface-raised text-ink-muted">
            Expired
          </span>
        );
      case "revoked":
        return (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger bg-danger-soft text-danger">
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
    <div className="mt-3 rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 border-line">
        <Shield className="h-3.5 w-3.5 text-ink-muted" />
        <span className="text-xs font-medium text-ink-muted">
          Shared Links ({shares.length})
        </span>
      </div>
      {revokeError && (
        <div className="border-b border-line bg-danger-soft px-3 py-2 text-xs text-danger border-line bg-danger-soft text-danger">
          {revokeError}
        </div>
      )}
      <div className="divide-y divide-line">
        {shares.map((share) => (
          <div
            key={share._id}
            className="flex items-center justify-between px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {share.mode === "one_time" ? (
                  <Eye className="h-3.5 w-3.5 text-ink-muted" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-ink-muted" />
                )}
                <span className="text-xs text-ink-muted">
                  {share.mode === "one_time" ? "One-time" : "Time-limited"}
                </span>
              </div>
              {getStatusBadge(share.status)}
              {share.status === "active" && (
                <span className="text-xs text-ink-muted">
                  {getTimeRemaining(share.expiresAt)}
                </span>
              )}
              <span className="text-xs text-ink-muted">
                {share.totalViewCount} view
                {share.totalViewCount !== 1 ? "s" : ""}
              </span>
            </div>
            {share.status === "active" && (
              <button
                onClick={() => handleRevoke(share._id)}
                disabled={revokingId === share._id}
                className="rounded p-1 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50 hover:bg-danger-soft hover:text-danger"
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
