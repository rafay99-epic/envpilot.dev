"use client";

import { useState, use } from "react";
import Link from "next/link";
import { GitPullRequest } from "lucide-react";
import { PageHeader } from "@envpilot/ui";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { ChangeRequestList } from "@/components/changes";
import {
  usePagination,
  useProjectBySlug,
  useConvexUser,
  useVariableRequests,
  useResolveVariableRequest,
} from "@/hooks";
import { createLogger } from "@/lib/logger";
import { useTimeZone } from "@/hooks/useTimeZone";
import { formatDateTimeShort } from "@/lib/format";

const log = createLogger("app/dashboard/project-requests");

interface RequestsPageProps {
  params: Promise<{ slug: string }>;
}

export default function ProjectRequestsPage({ params }: RequestsPageProps) {
  const { slug } = use(params);
  const { organization, user } = useAuthContext();
  const orgRole = normalizeOrgRole(organization?.role);
  const hasOrgRole = !!organization?.role;
  const canReviewRequests =
    hasOrgRole && roleLevel(orgRole) >= ROLE_LEVEL.team_lead;

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjectBySlug(orgId, slug);
  const isLoadingProject = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;
  const projectId = project?._id as Id<"projects"> | undefined;

  const { requests, isLoading: isLoadingRequests } = useVariableRequests(
    projectId,
    convexUserId
  );
  const resolveRequest = useResolveVariableRequest();

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPagination = usePagination(requests, { pageSize: 10 });
  const timeZone = useTimeZone();

  const handleCancel = async (requestId: Id<"environmentVariableRequests">) => {
    if (!projectId || !convexUserId) return;
    setNotice(null);
    setError(null);
    try {
      await resolveRequest.mutateAsync({
        requestId,
        action: "cancel",
        reviewedBy: convexUserId as string,
      });
      setNotice("Request canceled.");
    } catch (err) {
      log.error(
        "project_request_cancel_failed",
        {
          projectId,
          requestId,
          reviewedBy: convexUserId,
          organizationId: organization?.id,
        },
        err
      );
      setError(err instanceof Error ? err.message : "Failed to cancel request");
    }
  };

  if (isLoadingProject) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full p-3 bg-danger-soft">
          <GitPullRequest className="h-6 w-6 text-danger" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-ink">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-ink hover:text-ink-muted"
        >
          Back to Projects
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <PageHeader
          icon={GitPullRequest}
          title="Requests"
          description={
            <>
              Member-submitted variable changes with approval history for{" "}
              {project.name}.
            </>
          }
        />
      </div>

      {notice && (
        <div className="rounded-lg border p-4 border-accent-line bg-accent-soft">
          <p className="text-sm text-accent">{notice}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border p-4 border-danger-line bg-danger-soft">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-ink">Changes</h2>
        <ChangeRequestList projectId={projectId} />
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="divide-y divide-line">
          {isLoadingRequests ? (
            <TerminalLoading />
          ) : requests.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-ink-muted">
              No requests yet.
            </div>
          ) : (
            <>
              <AnimatedList
                className="divide-y divide-line"
                pageKey={requestPagination.currentPage}
              >
                {requestPagination.pageItems.map((request) => (
                  <div key={request._id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm font-semibold text-ink">
                            {request.key}
                          </code>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              request.status === "approved"
                                ? "bg-accent-soft text-accent"
                                : request.status === "rejected"
                                  ? "bg-danger-soft text-danger"
                                  : request.status === "canceled"
                                    ? "bg-surface-hover text-ink-muted"
                                    : "bg-warning-soft text-warning"
                            }`}
                          >
                            {request.status}
                          </span>
                          {request.environments?.map((env: string) => (
                            <span
                              key={env}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                env === "production"
                                  ? "bg-danger-soft text-danger"
                                  : env === "staging"
                                    ? "bg-warning-soft text-warning"
                                    : "bg-accent-soft text-accent"
                              }`}
                            >
                              {env}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-ink-muted">
                          Requested by{" "}
                          {request.requester?.name ??
                            request.requester?.email ??
                            "Unknown"}
                          {request.requestedByKeyId && (
                            <span className="ml-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                              automated · API key
                            </span>
                          )}
                          {" · "}
                          {formatDateTimeShort(request.createdAt, timeZone)}
                        </p>
                        {request.description && (
                          <p className="mt-2 text-sm text-ink-muted">
                            {request.description}
                          </p>
                        )}
                        {request.reviewReason && (
                          <p className="mt-2 text-xs text-ink-muted">
                            Review note: {request.reviewReason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {canReviewRequests && request.status === "pending" && (
                          <Link
                            href="/dashboard/requests"
                            className="rounded-lg border px-3 py-1.5 text-xs font-medium border-line text-ink-muted hover:bg-surface-hover"
                          >
                            Review →
                          </Link>
                        )}
                        {!canReviewRequests &&
                          convexUserId &&
                          request.status === "pending" &&
                          request.requestedBy === convexUserId && (
                            <button
                              onClick={() =>
                                handleCancel(
                                  request._id as Id<"environmentVariableRequests">
                                )
                              }
                              className="rounded-lg border px-3 py-1.5 text-xs font-medium border-line text-ink-muted hover:bg-surface-hover"
                            >
                              Cancel
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                ))}
              </AnimatedList>
              <Pagination
                currentPage={requestPagination.currentPage}
                totalPages={requestPagination.totalPages}
                hasNextPage={requestPagination.hasNextPage}
                hasPrevPage={requestPagination.hasPrevPage}
                onNextPage={requestPagination.nextPage}
                onPrevPage={requestPagination.prevPage}
                onGoToPage={requestPagination.goToPage}
                startIndex={requestPagination.startIndex}
                endIndex={requestPagination.endIndex}
                totalItems={requestPagination.totalItems}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
