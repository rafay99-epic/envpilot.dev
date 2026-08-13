"use client";

import { useState } from "react";
import { useQuery, useAction } from "convex/react";
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
import { ConfirmDialog } from "@/components/ui";
import { ENVIRONMENTS } from "@/constants/project";
import {
  Check,
  Eye,
  EyeOff,
  GitPullRequest,
  Loader2,
  Lock,
  X,
} from "lucide-react";
import { createLogger } from "@/lib/logger";
import { PageHeader } from "@envpilot/ui";

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
  /** Set for machine-originated requests: the API key that filed it. */
  requestedByKeyName: string | null;
  /** false = valueless request — the approver supplies the value. */
  hasValue: boolean;
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
    on: "border-accent-line bg-accent-soft text-accent",
    off: "border-line text-ink-subtle hover:text-ink-muted",
  },
  staging: {
    on: "border-warning-line bg-warning-soft text-warning",
    off: "border-line text-ink-subtle hover:text-ink-muted",
  },
  production: {
    on: "border-danger-line bg-danger-soft text-danger",
    off: "border-line text-ink-subtle hover:text-ink-muted",
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
  const revealValue = useAction(
    api.features.variables.requests.actions.revealValue
  );
  const approveWithValue = useAction(
    api.features.variables.requests.actions.approveWithValue
  );

  const handleRevealValue = async (request: ReviewerRequest) => {
    if (revealedValues[request._id] || revealingIds.has(request._id)) return;

    setRevealingIds((prev) => new Set(prev).add(request._id));
    try {
      const data = await revealValue({ requestId: request._id });
      setRevealedValues((prev) => ({
        ...prev,
        [request._id]: data.value,
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
    environments: string[],
    suppliedValue?: string
  ) => {
    if (!convexUserId || environments.length === 0) return;
    setNotice(null);
    setError(null);
    try {
      if (!request.hasValue) {
        // Valueless (machine) request — the reviewer supplies the value;
        // the action encrypts it before the review mutation runs.
        await approveWithValue({
          requestId: request._id,
          value: suppliedValue ?? "",
          environments,
        });
      } else {
        await resolveRequest.mutateAsync({
          requestId: request._id,
          action: "approve",
          reviewedBy: convexUserId as string,
          environments,
        });
      }
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
        <p className="font-mono text-sm text-ink-subtle">
          <span className="text-accent">$</span> envpilot request list
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          Select or create an organization to review variable requests.
        </p>
        <TerminalButtonLink href="/organizations" className="mt-6">
          Manage Organizations
        </TerminalButtonLink>
      </div>
    );
  }

  const header = (
    <PageHeader
      icon={GitPullRequest}
      title="Variable Requests"
      description="Review and approve developer-submitted variables"
    />
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
        <div className="rounded-lg border border-accent-line bg-accent-soft px-4 py-3">
          <p className="text-sm text-accent">{notice}</p>
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-danger-line bg-danger-soft px-4 py-3">
          <p className="text-sm text-danger">{error}</p>
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
                ? "border-accent-line bg-accent-soft text-accent"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink-muted"
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
                <tr className="border-b border-line">
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                    Request
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                    Environments
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                    Value
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-accent/70">
                    Requested
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-medium uppercase tracking-wider text-accent/70">
                    {isPendingTab ? "Actions" : "Review"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {requests.map((request, i) => (
                  <RequestRow
                    key={request._id}
                    request={request}
                    index={i}
                    isPending={request.status === "pending"}
                    revealedValue={revealedValues[request._id] ?? null}
                    isRevealing={revealingIds.has(request._id)}
                    onReveal={() => handleRevealValue(request)}
                    onAccept={(environments, suppliedValue) =>
                      handleAccept(request, environments, suppliedValue)
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
  onAccept: (environments: string[], suppliedValue?: string) => void;
  onReject: () => void;
}) {
  const [isValueVisible, setIsValueVisible] = useState(false);
  // Reviewer's environment override, pre-selected to the requested set.
  const [selectedEnvironments, setSelectedEnvironments] = useState<string[]>(
    request.environments
  );
  // Valueless (machine) requests: the reviewer types the value here.
  const [suppliedValue, setSuppliedValue] = useState("");

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

  const isMachine = request.requestedByKeyName !== null;
  const requesterName = request.requester?.name ?? request.requester?.email;
  const requesterEmail = request.requester?.email;

  return (
    <tr
      className="animate-row-in align-top transition-colors hover:bg-accent-soft"
      data-testid="request-row"
      style={{ animationDelay: `${index * 40}ms` }}
    >
      {/* Request: key, project, requester */}
      <td className="px-5 py-3">
        <div className="flex items-center gap-2">
          {request.isSensitive && <Lock className="h-3.5 w-3.5 text-warning" />}
          <code className="font-mono text-sm text-warning">{request.key}</code>
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">{request.projectName}</p>
        {isMachine ? (
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint">
            <TerminalBadge color="amber">automated</TerminalBadge>
            <span>
              API key &quot;{request.requestedByKeyName}&quot; · created by{" "}
              {requesterName ?? "Unknown"}
            </span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-ink-faint">
            {requesterName ?? "Unknown"}
            {requesterName && requesterEmail && requesterName !== requesterEmail
              ? ` · ${requesterEmail}`
              : ""}
          </p>
        )}
        {isMachine && request.description && (
          <p className="mt-1 max-w-[24rem] text-xs italic text-ink-subtle">
            &ldquo;{request.description}&rdquo;
          </p>
        )}
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

      {/* Value — hidden by default, fetched on click; valueless (machine)
          requests take the reviewer's value inline instead */}
      <td className="px-5 py-3">
        {!request.hasValue ? (
          isPending ? (
            <input
              type="password"
              data-testid="request-value-input"
              value={suppliedValue}
              onChange={(e) => setSuppliedValue(e.target.value)}
              placeholder="Enter the value to approve"
              className="w-44 rounded-lg border border-line bg-surface px-2 py-1.5 font-mono text-xs text-ink placeholder:text-ink-faint focus:border-accent-line focus:outline-none"
            />
          ) : (
            <span className="text-xs text-ink-faint">
              value supplied at approval
            </span>
          )
        ) : (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {isValueVisible && revealedValue ? (
                <code className="block max-w-[16rem] break-all font-mono text-xs text-accent">
                  {revealedValue}
                </code>
              ) : (
                <span className="font-mono text-sm text-ink-subtle">
                  ••••••••
                </span>
              )}
            </div>
            <button
              data-testid="request-value-toggle"
              onClick={handleToggleReveal}
              disabled={isRevealing}
              className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent disabled:opacity-50"
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
        )}
      </td>

      {/* Requested date */}
      <td className="whitespace-nowrap px-5 py-3 text-sm text-ink-subtle">
        {new Date(request.createdAt).toLocaleDateString()}
      </td>

      {/* Actions (pending) or review info (resolved) */}
      <td className="px-5 py-3 text-right">
        {isPending ? (
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center justify-end gap-2">
              <button
                data-testid="request-accept"
                onClick={() =>
                  onAccept(
                    selectedEnvironments,
                    request.hasValue ? undefined : suppliedValue
                  )
                }
                disabled={
                  selectedEnvironments.length === 0 ||
                  (!request.hasValue && suppliedValue.length === 0)
                }
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Accept
              </button>
              <button
                data-testid="request-reject"
                onClick={onReject}
                className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger"
              >
                <X className="h-3.5 w-3.5" />
                Reject
              </button>
            </div>
            {selectedEnvironments.length === 0 && (
              <p className="text-xs text-danger">
                Select at least one environment.
              </p>
            )}
            {!request.hasValue &&
              suppliedValue.length === 0 &&
              selectedEnvironments.length > 0 && (
                <p className="text-xs text-ink-subtle">
                  Enter the value to approve this request.
                </p>
              )}
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <TerminalBadge color={STATUS_BADGE_COLOR[request.status]}>
              {request.status}
            </TerminalBadge>
            {request.reviewer && (
              <span className="text-xs text-ink-subtle">
                by {request.reviewer.name ?? request.reviewer.email}
              </span>
            )}
            {request.reviewedAt && (
              <span className="text-xs text-ink-faint">
                {new Date(request.reviewedAt).toLocaleDateString()}
              </span>
            )}
            {request.reviewReason && (
              <span className="max-w-[16rem] text-xs text-ink-subtle">
                Note: {request.reviewReason}
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
