"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { ENVIRONMENTS, type Environment } from "@/constants/project";

export interface ApproveRequestData {
  environments: Environment[];
  reviewReason?: string;
}

interface ApproveRequestDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ApproveRequestData) => Promise<void> | void;
  requestKey: string;
  requesterLabel: string;
  requestedEnvironments: string[];
}

const envBadgeClasses: Record<string, string> = {
  production:
    "bg-red-100 text-red-700 ring-1 ring-red-300 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-700",
  staging:
    "bg-yellow-100 text-yellow-700 ring-1 ring-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 dark:ring-yellow-700",
  development:
    "bg-green-100 text-green-700 ring-1 ring-green-300 dark:bg-green-900/30 dark:text-green-400 dark:ring-green-700",
};

export function ApproveRequestDialog({
  isOpen,
  onClose,
  onConfirm,
  requestKey,
  requesterLabel,
  requestedEnvironments,
}: ApproveRequestDialogProps) {
  const [selectedEnvironments, setSelectedEnvironments] = useState<
    Environment[]
  >([]);
  const [reviewReason, setReviewReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset to the requested environments (pre-checked) whenever the dialog
  // opens for a (possibly different) request.
  useEffect(() => {
    if (isOpen) {
      setSelectedEnvironments(requestedEnvironments as Environment[]);
      setReviewReason("");
    }
  }, [isOpen, requestedEnvironments]);

  const toggleEnvironment = (env: Environment) => {
    setSelectedEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );
  };

  const handleConfirm = async () => {
    if (selectedEnvironments.length === 0) return;
    setIsSubmitting(true);
    try {
      await onConfirm({
        environments: selectedEnvironments,
        reviewReason: reviewReason.trim() || undefined,
      });
      onClose();
    } catch {
      // Error handling is done by the caller
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Approve Variable Request"
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Variable
          </p>
          <code className="mt-1 block font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {requestKey}
          </code>
        </div>

        <div>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Requested by
          </p>
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">
            {requesterLabel}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Create in environments <span className="text-red-500">*</span>
          </label>
          <div className="mt-2 space-y-2">
            {ENVIRONMENTS.map((env) => (
              <label
                key={env}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                <input
                  type="checkbox"
                  checked={selectedEnvironments.includes(env)}
                  onChange={() => toggleEnvironment(env)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-600 dark:bg-zinc-800"
                />
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${envBadgeClasses[env]}`}
                >
                  {env}
                </span>
                {requestedEnvironments.includes(env) && (
                  <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                    Requested
                  </span>
                )}
              </label>
            ))}
          </div>
          {selectedEnvironments.length === 0 && (
            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
              Select at least one environment.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="approve-review-reason"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Review note (optional)
          </label>
          <textarea
            id="approve-review-reason"
            value={reviewReason}
            onChange={(e) => setReviewReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Add a note for the requester..."
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting || selectedEnvironments.length === 0}
            className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Approving..." : "Approve"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
