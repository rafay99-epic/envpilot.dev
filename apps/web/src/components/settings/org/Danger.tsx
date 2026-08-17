"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DangerRow, SettingsSection } from "@envpilot/ui";
import {
  TerminalButton,
  TerminalInput,
} from "@/components/dashboard/terminal-ui";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";

const log = createLogger("settings/org-danger");

export function DangerTab({
  slug,
  organizationId,
  organizationName,
}: {
  /** Still needed by the transfer flow, which stays on its API route. */
  slug: string;
  organizationId: string;
  organizationName: string;
}) {
  const router = useRouter();
  const removeOrganization = useMutation(
    api.features.organizations.mutations.remove
  );
  const [error, setError] = useState<string | null>(null);

  const [transferEmail, setTransferEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);
  const [transferConfirmText, setTransferConfirmText] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleTransfer() {
    if (transferConfirmText !== organizationName || !transferEmail) return;

    setIsTransferring(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${slug}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserEmail: transferEmail }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to transfer organization");
      }

      router.refresh();
      router.push("/organizations");
    } catch (err) {
      log.error("organization_transfer_failed", { slug }, err);
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsTransferring(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== organizationName) return;

    setIsDeleting(true);
    setError(null);

    try {
      await removeOrganization({
        organizationId: organizationId as Id<"organizations">,
      });

      // No reset on this path on purpose: the organization is gone and we
      // are navigating away, so the button must stay disabled through the
      // transition rather than flicker back to "Delete".
      router.push("/organizations");
    } catch (err) {
      log.error("organization_delete_failed", { organizationId }, err);
      setError(sanitizeConvexError(err) || "An error occurred");
      // The rejection path DOES reset, which is what the rule is protecting
      // against; it cannot see the router.push above. A `finally` is not an
      // option here either, since one makes React Compiler bail on the whole
      // component.
      // react-doctor-disable-next-line react-doctor/no-loading-flag-reset-outside-finally
      setIsDeleting(false);
    }
  }

  const confirmPrompt = (verb: string) => (
    <p className="text-[13px] text-ink">
      Type <span className="font-mono font-semibold">{organizationName}</span>{" "}
      to {verb}:
    </p>
  );

  return (
    <SettingsSection
      title="Danger zone"
      tone="danger"
      description="Irreversible actions. Read the consequences before typing a name."
    >
      <DangerRow
        title="Transfer ownership"
        description="Hand this organization to another user. This cannot be undone."
        consequences={[
          "The new owner takes over the organization and its billing.",
          "You are removed from the organization and lose all access.",
          "Every other member keeps their role and access.",
          "Projects, variables, shared accounts and API keys stay intact.",
        ]}
        action={
          <div className="space-y-3 sm:w-80">
            <TerminalInput
              type="email"
              value={transferEmail}
              onChange={(e) => setTransferEmail(e.target.value)}
              placeholder="New owner's email"
              aria-label="New owner's email"
            />
            {showTransferConfirm && transferEmail ? (
              <>
                {confirmPrompt("confirm")}
                <TerminalInput
                  type="text"
                  value={transferConfirmText}
                  onChange={(e) => setTransferConfirmText(e.target.value)}
                  placeholder="Organization name"
                />
                <div className="flex flex-wrap gap-2">
                  <TerminalButton
                    variant="secondary"
                    onClick={() => {
                      setShowTransferConfirm(false);
                      setTransferConfirmText("");
                    }}
                  >
                    Cancel
                  </TerminalButton>
                  <TerminalButton
                    variant="danger"
                    onClick={handleTransfer}
                    disabled={
                      transferConfirmText !== organizationName || isTransferring
                    }
                  >
                    {isTransferring ? "Transferring..." : "Transfer ownership"}
                  </TerminalButton>
                </div>
              </>
            ) : (
              <TerminalButton
                variant="danger"
                onClick={() => setShowTransferConfirm(true)}
                disabled={!transferEmail}
              >
                Transfer ownership
              </TerminalButton>
            )}
          </div>
        }
      />

      <DangerRow
        title="Delete organization"
        description="Once you delete an organization, there is no going back."
        consequences={[
          "Every project in this organization is deleted along with its settings and history.",
          "Environment variables and shared accounts keep a 7-day retention window, after which their stored secret values are destroyed.",
          "All members lose access immediately.",
          "API keys, CI/CD tokens and webhooks for this organization stop working.",
        ]}
        action={
          showDeleteConfirm ? (
            <div className="space-y-3 sm:w-80">
              {confirmPrompt("confirm deletion")}
              <TerminalInput
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Organization name"
              />
              <div className="flex flex-wrap gap-2">
                <TerminalButton
                  variant="secondary"
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeleteConfirmText("");
                  }}
                >
                  Cancel
                </TerminalButton>
                <TerminalButton
                  variant="danger"
                  onClick={handleDelete}
                  disabled={
                    deleteConfirmText !== organizationName || isDeleting
                  }
                >
                  {isDeleting ? "Deleting..." : "Delete organization"}
                </TerminalButton>
              </div>
            </div>
          ) : (
            <TerminalButton
              variant="danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete organization
            </TerminalButton>
          )
        }
      />

      {error && (
        <p className="border-t border-danger-line/40 py-3 font-mono text-[12px] text-danger">
          {error}
        </p>
      )}
    </SettingsSection>
  );
}
