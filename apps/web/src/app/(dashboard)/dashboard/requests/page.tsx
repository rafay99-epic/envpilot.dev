"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useConvexUser, useResolveVariableRequest } from "@/hooks";
import { useAuthContext } from "@/components/auth";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";
import {
  TerminalWindow,
  TerminalButtonLink,
  TerminalLoading,
  TerminalEmptyState,
  TerminalBadge,
} from "@/components/dashboard/terminal-ui";
import { staggeredRow } from "@/components/dashboard/animated-list";
import { ConfirmDialog } from "@/components/ui";
import { ENVIRONMENTS } from "@/constants/project";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, Lock, Check, X } from "lucide-react";
import { createLogger } from "@/lib/logger";

const log = createLogger("app/dashboard/requests");

type RequestStatus = "pending" | "approved" | "rejected" | "canceled";

interface ReviewerRequest {
  _id: Id<"environmentVariableRequests">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  status: RequestStatus;
  reviewReason?: string;
  reviewedAt?: number;
  requestedBy: Id<"users">;
  createdAt: number;
  projectName: string;
  requester: { _id: Id<"users">; email: string; name?: string } | null;
  reviewer?: { _id: Id<"users">; email: string; name?: string } | null;
}

const STATUS_TABS: { value: RequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "canceled", label: "Canceled" },
];

const STATUS_BADGE_COLOR: Record<
  RequestStatus,
  "green" | "red" | "zinc" | "amber"
> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  canceled: "zinc",
};

// Environment chip palette — mirrors the green=dev / amber=staging / red=prod
// convention used across the variables UI.
const ENV_COLOR: Record<string, { on: string; off: string }> = {
  development: {
    on: "border-green-500/30 bg-green-500/10 text-green-400",
    off: "border-zinc-700 text-zinc-500 hover:text-zinc-300",
  },
  staging: {
    on: "border-amber-500/30 bg-amber-500/10 text-amber-400",
    off: "border-zinc-700 text-zinc-500 hover:text-zinc-300",
  },
  production: {
    on: "border-red-500/30 bg-red-500/10 text-red-400",
    off: "border-zinc-700 text-zinc-500 hover:text-zinc-300",
  },
};

function envBadgeColor(env: string): "green" | "amber" | "red" | "zinc" {
  if (env === "production") return "red";
  if (env === "staging") return "amber";
  if (env === "development") return "green";
  return "zinc";
}

export default function RequestsPage() {
  const { organization, roleMeta, user } = useAuthContext();
  const activeOrganizationId = organization?.id as
    | Id<"organizations">
    | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  // Reviewers are team leads and above (owner / project manager / team lead).
  // Developers get an empty result from listForReviewer — mirror that here so
  // the nav-gated page also renders a friendly notice for them.
  const canReview =
    (roleMeta?.level ?? roleLevel(normalizeOrgRole(organization?.role))) >=
    ROLE_LEVEL.team_lead;

  const [status, setStatus] = useState<RequestStatus>("pending");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectingRequest, setRejectingRequest] =
    useState<ReviewerRequest | null>(null);

  // Reveal value state — value is fetched ON CLICK from the value route and
  // cached here so re-toggling never refetches (free-tier friendly).
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  const requestsResult = useQuery(
    api.features.variables.requests.queries.listForReviewer,
    // Identity is derived server-side from the attached JWT; `convexUserId`
    // gates the query until the current user is known (auth ready).
    activeOrganizationId && convexUserId
      ? { organizationId: activeOrganizationId, status }
      : "skip"
  );
  const requests = (requestsResult ?? []) as ReviewerRequest[];
  const isLoading =
    activeOrganizationId && convexUserId ? requestsResult === undefined : false;

  const resolveRequest = useResolveVariableRequest();

  const handleRevealValue = async (request: ReviewerRequest) => {
    if (revealedValues[request._id] || revealingIds.has(request._id)) return;

    setRevealingIds((prev) => new Set(prev).add(request._id));
    try {
      const res = await fetch(`/api/variable-requests/${request._id}/value`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reveal value");
      setRevealedValues((prev) => ({
        ...prev,
        [request._id]: data.data.value,
      }));
    } catch (err) {
      log.error(
        "request_reveal_failed",
        { requestId: request._id, organizationId: activeOrganizationId },
        err
      );
      setError("Failed to reveal request value.");
      setTimeout(() => setError(null), 3000);
    } finally {
      setRevealingIds((prev) => {
        const next = new Set(prev);
        next.delete(request._id);
        return next;
      });
    }
  };

  const handleAccept = async (
    request: ReviewerRequest,
    environments: string[]
  ) => {
    if (!convexUserId || environments.length === 0) return;
    setNotice(null);
    setError(null);
    try {
      await resolveRequest.mutateAsync({
        requestId: request._id,
        action: "approve",
        reviewedBy: convexUserId as string,
        environments,
      });
      setNotice(`Request for "${request.key}" approved and variable created.`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      log.error(
        "request_approve_failed",
        {
          requestId: request._id,
          reviewedBy: convexUserId,
          organizationId: activeOrganizationId,
        },
        err
      );
      setError(
        err instanceof Error ? err.message : "Failed to approve request"
      );
    }
  };

  const handleReject = async () => {
    if (!rejectingRequest || !convexUserId) return;
    setNotice(null);
    setError(null);
    try {
      await resolveRequest.mutateAsync({
        requestId: rejectingRequest._id,
        action: "reject",
        reviewedBy: convexUserId as string,
      });
      setNotice(`Request for "${rejectingRequest.key}" rejected.`);
      setTimeout(() => setNotice(null), 3000);
      // ConfirmDialog closes itself on success; clearing here is defensive.
      setRejectingRequest(null);
    } catch (err) {
      log.error(
        "request_reject_failed",
        {
          requestId: rejectingRequest._id,
          reviewedBy: convexUserId,
          organizationId: activeOrganizationId,
        },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to reject request");
      // Rethrow so ConfirmDialog keeps itself open on failure.
      throw err;
    }
  };

  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="font-mono text-sm text-zinc-500">
          <span className="text-green-400">$</span> envpilot request list
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Select or create an organization to review variable requests.
        </p>
        <TerminalButtonLink href="/organizations" className="mt-6">
          Manage Organizations
        </TerminalButtonLink>
      </div>
    );
  }

  const header = (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold text-zinc-100">Variable Requests</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Review and approve developer-submitted variables
        </p>
      </div>
    </div>
  );

  if (!canReview) {
    return (
      <div className="space-y-6" data-testid="requests-page">
        {header}
        <TerminalWindow title="requests">
          <TerminalEmptyState
            command="envpilot request review"
            message="Only owners, project managers, and team leads review requests."
          />
        </TerminalWindow>
      </div>
    );
  }

  const isPendingTab = status === "pending";

  return (
    <div className="space-y-6" data-testid="requests-page">
      {header}

      {/* Notices */}
      {notice && (
        <div className="rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-3">
          <p className="text-sm text-green-400">{notice}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatus(tab.value)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              status === tab.value
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Requests list */}
      {isLoading ? (
        <TerminalLoading />
      ) : requests.length === 0 ? (
        <TerminalWindow title="requests">
          <TerminalEmptyState
            command="envpilot request list"
            message={`No ${status} requests.`}
          />
        </TerminalWindow>
      ) : (
        <TerminalWindow title="requests">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700/50">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Request
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Environments
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Value
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-green-500/70">
                    Requested
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-green-500/70">
                    {isPendingTab ? "Actions" : "Review"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {requests.map((request, i) => (
                  <RequestRow
                    key={request._id}
                    request={request}
                    index={i}
                    isPending={request.status === "pending"}
                    revealedValue={revealedValues[request._id] ?? null}
                    isRevealing={revealingIds.has(request._id)}
                    onReveal={() => handleRevealValue(request)}
                    onAccept={(environments) =>
                      handleAccept(request, environments)
                    }
                    onReject={() => setRejectingRequest(request)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </TerminalWindow>
      )}

      {/* Reject confirmation */}
      <ConfirmDialog
        isOpen={!!rejectingRequest}
        onClose={() => setRejectingRequest(null)}
        onConfirm={handleReject}
        title="Reject Variable Request"
        message={`Reject the request for "${rejectingRequest?.key}"? The requester will be notified and no variable will be created.`}
        confirmText="Reject"
        variant="danger"
      />
    </div>
  );
}

function RequestRow({
  request,
  index = 0,
  isPending,
  revealedValue,
  isRevealing,
  onReveal,
  onAccept,
  onReject,
}: {
  request: ReviewerRequest;
  index?: number;
  isPending: boolean;
  revealedValue: string | null;
  isRevealing: boolean;
  onReveal: () => void;
  onAccept: (environments: string[]) => void;
  onReject: () => void;
}) {
  const [isValueVisible, setIsValueVisible] = useState(false);
  // Reviewer's environment override, pre-selected to the requested set.
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(
    request.environments
  );

  const handleToggleReveal = () => {
    if (!revealedValue && !isRevealing) {
      onReveal();
      setIsValueVisible(true);
    } else {
      setIsValueVisible((v) => !v);
    }
  };

  const toggleEnv = (env: string) =>
    setSelectedEnvironments((prev) =>
      prev.includes(env) ? prev.filter((e) => e !== env) : [...prev, env]
    );

  const requesterName = request.requester?.name ?? request.requester?.email;
  const requesterEmail = request.requester?.email;

  return (
    <motion.tr
      className="align-top transition-colors hover:bg-green-500/5"
      data-testid="request-row"
      {...staggeredRow(index)}
    >
      {/* Request: key, project, requester */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          {request.isSensitive && (
            <Lock className="h-3.5 w-3.5 text-amber-500" />
          )}
          <code className="font-mono text-sm text-amber-400">
            {request.key}
          </code>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{request.projectName}</p>
        <p className="mt-0.5 text-xs text-zinc-600">
          {requesterName ?? "Unknown"}
          {requesterName && requesterEmail && requesterName !== requesterEmail
            ? ` · ${requesterEmail}`
            : ""}
        </p>
      </td>

      {/* Environments — toggleable override for pending, static otherwise */}
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-1.5">
          {isPending
            ? ENVIRONMENTS.map((env) => {
                const selected = selectedEnvironments.includes(env);
                const palette = ENV_COLOR[env] ?? ENV_COLOR.development;
                return (
                  <button
                    key={env}
                    type="button"
                    data-testid={`request-env-${env}`}
                    onClick={() => toggleEnv(env)}
                    aria-pressed={selected}
                    title={
                      request.environments.includes(env)
                        ? `${env} (requested)`
                        : env
                    }
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                      selected ? palette.on : palette.off
                    }`}
                  >
                    {selected && <Check className="h-3 w-3" />}
                    {env}
                  </button>
                );
              })
            : request.environments.map((env) => (
                <TerminalBadge key={env} color={envBadgeColor(env)}>
                  {env}
                </TerminalBadge>
              ))}
        </div>
      </td>

      {/* Value — hidden by default, fetched on click */}
      <td className="px-5 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            {isValueVisible && revealedValue ? (
              <code className="block max-w-[16rem] break-all font-mono text-xs text-green-400">
                {revealedValue}
              </code>
            ) : (
              <span className="font-mono text-sm text-zinc-500">••••••••</span>
            )}
          </div>
          <button
            data-testid="request-value-toggle"
            onClick={handleToggleReveal}
            disabled={isRevealing}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-green-400 disabled:opacity-50"
            title={
              isValueVisible && revealedValue ? "Hide value" : "Reveal value"
            }
          >
            {isRevealing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isValueVisible && revealedValue ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </td>

      {/* Requested date */}
      <td className="whitespace-nowrap px-5 py-3 text-sm text-zinc-500">
        {new Date(request.createdAt).toLocaleDateString()}
      </td>

      {/* Actions (pending) or review info (resolved) */}
      <td className="px-5 py-3 text-right">
        {isPending ? (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center justify-end gap-2">
              <button
                data-testid="request-accept"
                onClick={() => onAccept(selectedEnvironments)}
                disabled={selectedEnvironments.length === 0}
                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </button>
              <button
                data-testid="request-reject"
                onClick={onReject}
                className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
            {selectedEnvironments.length === 0 && (
              <p className="text-xs text-red-400">
                Select at least one environment.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <TerminalBadge color={STATUS_BADGE_COLOR[request.status]}>
              {request.status}
            </TerminalBadge>
            {request.reviewer && (
              <span className="text-xs text-zinc-500">
                by {request.reviewer.name ?? request.reviewer.email}
              </span>
            )}
            {request.reviewedAt && (
              <span className="text-xs text-zinc-600">
                {new Date(request.reviewedAt).toLocaleDateString()}
              </span>
            )}
            {request.reviewReason && (
              <span className="max-w-[16rem] text-xs text-zinc-500">
                Note: {request.reviewReason}
              </span>
            )}
          </div>
        )}
      </td>
    </motion.tr>
  );
}
