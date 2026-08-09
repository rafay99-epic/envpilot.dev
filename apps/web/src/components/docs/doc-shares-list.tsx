"use client";

import { useState } from "react";
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

  if (shares === undefined || shares.length === 0) return null;

  const copy = async (shareId: Id<"docShares">, token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/d/${token}`);
    setCopiedId(shareId);
    setTimeout(() => setCopiedId(null), 2000);
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
    <section className="mt-10 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="mb-3 font-mono text-xs tracking-wide text-zinc-500 uppercase">
        Shared with ({shares.length})
      </h2>
      <ul className="space-y-1.5">
        {shares.map((share) => (
          <li
            key={share._id}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
          >
            {share.audience === "member" ? (
              <Users className="h-4 w-4 shrink-0 text-zinc-500" />
            ) : (
              <Globe className="h-4 w-4 shrink-0 text-amber-500" />
            )}

            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm text-zinc-800 dark:text-zinc-200">
                {share.recipientName}
                {share.hasPassphrase && (
                  <Lock
                    className="h-3 w-3 text-zinc-500"
                    aria-label="Passphrase protected"
                  />
                )}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
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
                className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Copy link"
              >
                {copiedId === share._id ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
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
                className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-red-500/10 hover:text-red-500 disabled:opacity-40"
                aria-label={`Revoke access for ${share.recipientName}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </section>
  );
}
