"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Id } from "@convex/_generated/dataModel";
import { FeatureGate } from "@/components/tier/FeatureGate";

/**
 * Security-hold dialog: suspend a member's access org-wide (incident
 * response — e.g. a compromised laptop). Shows the org credentials the
 * target created (API keys / CI-CD service tokens) with opt-in revocation —
 * they may live on the compromised machine, but may also power shared CI,
 * so never auto-revoked. Pro-gated via FeatureGate.
 */
export function SuspendMemberDialog({
  open,
  onClose,
  organizationId,
  slug,
  targetUserId,
  targetName,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  slug: string;
  targetUserId: string;
  targetName: string;
  onError: (message: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [selectedCreds, setSelectedCreds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const credentials = useQuery(
    api.features.organizations.securityHold.listMemberCredentials,
    open
      ? {
          organizationId: organizationId as Id<"organizations">,
          targetUserId: targetUserId as Id<"users">,
        }
      : "skip"
  );

  if (!open) return null;

  function toggleCred(id: string) {
    setSelectedCreds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSuspend() {
    setSubmitting(true);
    try {
      const revokeCredentials = (credentials ?? [])
        .filter((c) => selectedCreds.has(c.id))
        .map((c) => ({ type: c.type, id: c.id }));

      const response = await fetch(
        `/api/organizations/${slug}/members/${targetUserId}/suspend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: reason.trim() || undefined,
            revokeCredentials: revokeCredentials.length
              ? revokeCredentials
              : undefined,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to suspend member");
      }
      if (data.credentialErrors?.length) {
        onError(
          `Access suspended, but some credentials could not be revoked: ${data.credentialErrors.join(", ")}`
        );
      }
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to suspend member");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-zinc-900">
        <FeatureGate
          organizationId={organizationId as Id<"organizations">}
          featureKey="security_hold"
          featureName="Security Hold"
          fallbackVariant="card"
        >
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Suspend access for {targetName}
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Freezes all of their access to this organization — web, CLI,
            extension, and API — and signs them out everywhere. Synced .env
            files on their devices are deleted. Their role, projects, and
            permissions are kept, so you can reinstate them exactly as they
            were.
          </p>

          <label className="mt-4 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Reason (kept in the audit log, never shown to the member)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="e.g. Laptop reported compromised"
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
          </label>

          {credentials && credentials.length > 0 && (
            <div className="mt-4">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Credentials they created — revoke too?
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                These may be stored on their devices, but may also power shared
                CI pipelines. Revoking is optional and audited.
              </p>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {credentials.map((cred) => (
                  <label
                    key={cred.id}
                    className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCreds.has(cred.id)}
                      onChange={() => toggleCred(cred.id)}
                    />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {cred.name}
                    </span>
                    <span className="ml-auto text-xs text-zinc-500">
                      {cred.type === "api_key" ? "API key" : "CI/CD token"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={handleSuspend}
              disabled={submitting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? "Suspending…" : "Suspend access"}
            </button>
          </div>
        </FeatureGate>
        {/* Escape hatch when the FeatureGate fallback replaces the content */}
        <button
          onClick={onClose}
          className="mt-4 block w-full text-center text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}
