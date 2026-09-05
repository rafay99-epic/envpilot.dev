"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { AlertTriangle } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DrawerPanel } from "@/components/ui";
import {
  TerminalButton,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { sanitizeConvexError } from "@/lib/error-messages";

/**
 * Non-secret fields worth diffing, per resource type. A payload never carries
 * a value, credentials or file contents.
 */
const DIFF_FIELDS: Record<string, readonly string[]> = {
  variable: [
    "key",
    "description",
    "environments",
    "isSensitive",
    "tagIds",
    "rotationFrequencyDays",
    "targetVersion",
  ],
  account: ["name", "websiteUrl", "description", "environments"],
  file: ["name", "path", "mode", "description", "environments"],
};

/**
 * Fields the current-value snapshot never carries — rollback's target
 * version isn't a property of the resource, it's an instruction. Rendered
 * as "not shown" rather than "not set" so an approver doesn't read it as a
 * known-empty value.
 */
const NOT_IN_SNAPSHOT = new Set(["targetVersion"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parsePayload(payload: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(payload));
  } catch {
    return null;
  }
}

function render(value: unknown): string {
  if (value === undefined || value === null || value === "") return "not set";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) return value.map(String).join(", ");
  return String(value);
}

/**
 * The non-secret field diff an approver reads before deciding. Its own
 * component so the drawer body stays about the review actions.
 */
function ChangeDiffTable({
  payload,
  current,
  fields,
}: {
  payload: Record<string, unknown> | null;
  current: Record<string, unknown> | null;
  fields: readonly string[];
}) {
  if (payload === null) {
    return <p className="text-sm text-ink-subtle">Unreadable payload.</p>;
  }
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-line text-left text-ink-subtle">
          <th className="py-2 font-medium">Field</th>
          <th className="py-2 font-medium">Current</th>
          <th className="py-2 font-medium">Proposed</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {fields.map((field) => (
          <tr key={field}>
            <td className="py-2 pr-3 text-ink-muted">{field}</td>
            <td className="py-2 pr-3 font-mono text-ink-subtle">
              {NOT_IN_SNAPSHOT.has(field)
                ? "not shown"
                : render(current?.[field])}
            </td>
            <td className="py-2 font-mono text-ink">
              {field in payload ? render(payload[field]) : "unchanged"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChangeReviewDrawer({
  requestId,
  onClose,
}: {
  requestId: Id<"changeRequests">;
  onClose: () => void;
}) {
  const request = useQuery(api.features.changeRequests.queries.getForReview, {
    requestId,
  });
  const review = useMutation(api.features.changeRequests.mutations.review);
  const cancel = useMutation(api.features.changeRequests.mutations.cancel);

  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(sanitizeConvexError(err));
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  };

  const payload = request ? parsePayload(request.payload) : null;
  const current = asRecord(request?.current);
  const fields = request ? (DIFF_FIELDS[request.resourceType] ?? []) : [];
  const isPending = request?.status === "pending";

  return (
    <DrawerPanel
      isOpen
      onClose={onClose}
      title="Review change request"
      width="xl"
      preventClose={busy}
    >
      {request === undefined ? (
        <TerminalLoading />
      ) : (
        <div className="space-y-5">
          <div>
            <code className="font-mono text-sm text-warning">
              {request.label}
            </code>
            <p className="mt-0.5 text-xs text-ink-subtle">
              {request.kind} {request.resourceType} ·{" "}
              {request.environments.join(", ")} · {request.status}
            </p>
            <p className="mt-0.5 text-xs text-ink-faint">
              Requested by{" "}
              {request.requester?.name ?? request.requester?.email ?? "Unknown"}{" "}
              via {request.source}
            </p>
          </div>

          {request.isStale && (
            <div
              data-testid="change-stale-warning"
              className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft px-3 py-2 text-xs text-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                The target changed after this was filed. Ask the requester to
                file it again.
              </span>
            </div>
          )}

          {request.reason && (
            <p className="text-sm text-ink-muted">Reason: {request.reason}</p>
          )}

          <ChangeDiffTable
            payload={payload}
            current={current}
            fields={fields}
          />

          {request.reviewReason && (
            <p className="text-xs text-ink-subtle">
              Review note: {request.reviewReason}
            </p>
          )}

          {error && <p className="text-sm text-danger">{error}</p>}

          {isPending && (
            <ReviewActions
              busy={busy}
              canApprove={request.canApprove}
              canCancel={request.canCancel}
              isStale={request.isStale}
              rejectReason={rejectReason}
              onRejectReasonChange={setRejectReason}
              onCancel={() => void run(() => cancel({ requestId }))}
              onReject={() =>
                void run(() =>
                  review({
                    requestId,
                    decision: "reject",
                    reason: rejectReason.trim(),
                  })
                )
              }
              onApprove={() =>
                void run(() => review({ requestId, decision: "approve" }))
              }
            />
          )}
        </div>
      )}
    </DrawerPanel>
  );
}

/** Reject reason and the three decisions an approver can take. */
function ReviewActions({
  busy,
  canApprove,
  canCancel,
  isStale,
  rejectReason,
  onRejectReasonChange,
  onCancel,
  onReject,
  onApprove,
}: {
  busy: boolean;
  canApprove: boolean;
  canCancel: boolean;
  isStale: boolean;
  rejectReason: string;
  onRejectReasonChange: (value: string) => void;
  onCancel: () => void;
  onReject: () => void;
  onApprove: () => void;
}) {
  return (
    <>
      <div>
        <label
          htmlFor="change-reject-reason"
          className="block text-sm font-medium text-ink-muted"
        >
          Rejection reason
        </label>
        <textarea
          id="change-reject-reason"
          data-testid="change-reject-reason"
          value={rejectReason}
          onChange={(e) => onRejectReasonChange(e.target.value)}
          rows={2}
          placeholder="Required to reject"
          className="mt-1 block w-full rounded-lg border border-line bg-surface-raised px-3 py-2 text-sm text-ink placeholder-ink-subtle focus:border-line-strong focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {canCancel && (
          <TerminalButton
            type="button"
            variant="secondary"
            data-testid="change-cancel"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel request
          </TerminalButton>
        )}
        <TerminalButton
          type="button"
          variant="secondary"
          data-testid="change-reject"
          disabled={busy || !canApprove || rejectReason.trim().length === 0}
          onClick={onReject}
        >
          Reject
        </TerminalButton>
        <TerminalButton
          type="button"
          data-testid="change-approve"
          disabled={busy || !canApprove || isStale}
          onClick={onApprove}
        >
          Approve
        </TerminalButton>
      </div>
      {!canApprove && (
        <p className="text-right text-xs text-ink-subtle">
          A second person applies this change.
        </p>
      )}
    </>
  );
}
