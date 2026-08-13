"use client";

import { useState } from "react";
import {
  Flame,
  Clock,
  Lock,
  X,
  Loader2,
  Check,
  Circle,
  Eye,
} from "lucide-react";
import { AnimatedList } from "@/components/dashboard/animated-list";

interface ShareRecipient {
  email: string;
  hasViewed: boolean;
  viewedAt?: number;
  otpVerified: boolean;
}

export interface ShareData {
  _id: string;
  variableKey: string;
  mode: "one_time" | "time_limited";
  status: "active" | "burned" | "expired" | "revoked";
  expiresAt: number;
  hasPassphrase: boolean;
  totalViewCount: number;
  createdAt: number;
  recipients: ShareRecipient[];
}

interface SharedVariablesSectionProps {
  shares: ShareData[];
  onRevoke: (shareId: string) => Promise<void>;
  canRevoke: boolean;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function formatTimeRemaining(expiresAt: number): string {
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getStatusBadge(status: ShareData["status"]) {
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
}

export function SharedVariablesSection({
  shares,
  onRevoke,
  canRevoke,
}: SharedVariablesSectionProps) {
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const handleRevoke = async (shareId: string) => {
    if (
      !confirm(
        "Are you sure you want to revoke this share? Recipients will no longer be able to access the variable."
      )
    ) {
      return;
    }
    setRevokingId(shareId);
    setRevokeError(null);
    try {
      await onRevoke(shareId);
    } catch (err) {
      setRevokeError(
        err instanceof Error ? err.message : "Failed to revoke share"
      );
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white border-line bg-surface">
      <div className="border-b border-line px-6 py-4 border-line">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-ink">
            Shared Variables
          </h2>
          <span className="rounded-full bg-surface-raised px-2 py-0.5 text-xs font-medium text-ink-faint bg-surface-raised text-ink-muted">
            {shares.length}
          </span>
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          All shared environment variable links and their status.
        </p>
      </div>

      {revokeError && (
        <div className="border-b border-line bg-danger-soft px-6 py-2 text-xs text-danger border-line bg-danger-soft text-danger">
          {revokeError}
        </div>
      )}

      <div className="divide-y divide-line">
        {shares.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-ink-muted">
            No shared variables yet.
          </div>
        ) : (
          <AnimatedList className="divide-y divide-line">
            {shares.map((share) => (
              <div key={share._id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-ink">
                        {share.variableKey}
                      </code>
                      <span className="flex items-center gap-1 text-xs text-ink-muted">
                        {share.mode === "one_time" ? (
                          <Flame className="h-3.5 w-3.5" />
                        ) : (
                          <Clock className="h-3.5 w-3.5" />
                        )}
                        {share.mode === "one_time"
                          ? "One-time"
                          : "Time-limited"}
                      </span>
                      {getStatusBadge(share.status)}
                      {share.hasPassphrase && (
                        <Lock className="h-3.5 w-3.5 text-ink-muted" />
                      )}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {share.recipients.map((recipient) => (
                        <span
                          key={recipient.email}
                          className="flex items-center gap-1 text-xs text-ink-muted"
                        >
                          {recipient.hasViewed ? (
                            <Check className="h-3 w-3 text-accent" />
                          ) : (
                            <Circle className="h-2.5 w-2.5 fill-ink-muted text-ink-muted fill-ink-faint text-ink-faint" />
                          )}
                          {recipient.email}
                        </span>
                      ))}
                    </div>

                    <p className="mt-1.5 text-xs text-ink-muted">
                      Created {formatRelativeTime(share.createdAt)}
                      {share.status === "active" && (
                        <>
                          {" · "}Expires in{" "}
                          {formatTimeRemaining(share.expiresAt)}
                        </>
                      )}
                      {" · "}
                      <Eye className="mb-px inline h-3 w-3" />{" "}
                      {share.totalViewCount} view
                      {share.totalViewCount !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {canRevoke && share.status === "active" && (
                    <button
                      onClick={() => handleRevoke(share._id)}
                      disabled={revokingId === share._id}
                      className="shrink-0 rounded p-1 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50 hover:bg-danger-soft hover:text-danger"
                      title="Revoke share"
                    >
                      {revokingId === share._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </AnimatedList>
        )}
      </div>
    </div>
  );
}
