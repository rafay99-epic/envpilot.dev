"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Globe, Lock, Trash2, Users } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useDocShares, useRevokeDocShare } from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";

/**
 * Who this page is currently shared with, and the one control that matters:
 * revoke. Read-only for anyone who can see the page — knowing where your
 * team's documentation went is not a privileged act; ending it is, and the
 * mutation enforces that.
 */
export function DocSharesList({ docId }: { docId: Id<"docs"> }) {
  const shares = useDocShares(docId);
  const revoke = useRevokeDocShare();

  const [busyId, setBusyId] = useState<Id<"docShares"> | null>(null);
  const [copiedId, setCopiedId] = useState<Id<"docShares"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  if (shares === undefined || shares.length === 0) return null;

  const copy = async (shareId: Id<"docShares">, token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/d/${token}`);
    setCopiedId(shareId);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedId(null), 2000);
  };

  const onRevoke = async (shareId: Id<"docShares">) => {
    setBusyId(shareId);
    setError(null);
    try {
      await revoke({ shareId });
    } catch (err) {
      setError(sanitizeConvexError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mt-10 border-t pt-6 border-line">
      <h2 className="mb-3 font-mono text-xs tracking-wide text-ink-subtle uppercase">
        Shared with ({shares.length})
      </h2>
      <ul className="space-y-1.5">
        {shares.map((share) => (
          <li
            key={share._id}
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 border-line"
          >
            {share.audience === "member" ? (
              <Users className="h-4 w-4 shrink-0 text-ink-subtle" />
            ) : (
              <Globe className="h-4 w-4 shrink-0 text-warning" />
            )}

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm text-ink">
                {share.recipientName}
                {share.hasPassphrase && (
                  <Lock
                    className="h-3 w-3 text-ink-subtle"
                    aria-label="Passphrase protected"
                  />
                )}
              </p>
              <p className="truncate text-[11px] text-ink-subtle">
                {share.isExpired
                  ? "Expired"
                  : `Expires ${new Date(share.expiresAt).toLocaleDateString()}`}
                {" · "}
                {share.viewCount === 0
                  ? "not opened yet"
                  : `${share.viewCount} ${share.viewCount === 1 ? "view" : "views"}`}
                {" · by "}
                {share.createdByName}
              </p>
            </div>

            {share.audience === "external" && share.token && (
              <button
                type="button"
                onClick={() => copy(share._id, share.token!)}
                className="shrink-0 rounded p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-ink"
                aria-label="Copy link"
              >
                {copiedId === share._id ? (
                  <Check className="h-3.5 w-3.5 text-accent" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            {/* Absent, not disabled, when the caller cannot revoke: the flag
                mirrors the mutation's own rule, so a rendered button always
                works. */}
            {share.canRevoke && (
              <button
                type="button"
                onClick={() => onRevoke(share._id)}
                disabled={busyId === share._id}
                className="shrink-0 rounded p-1.5 text-ink-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-40"
                aria-label={`Revoke access for ${share.recipientName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </section>
  );
}
