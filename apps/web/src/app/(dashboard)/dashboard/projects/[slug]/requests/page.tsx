"use client";

import { useState, use } from "react";
import Link from "next/link";
import { GitPullRequest } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { normalizeOrgRole, roleLevel, ROLE_LEVEL } from "@/lib/roles";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import {
  usePagination,
  useProjectBySlug,
  useConvexUser,
  useVariableRequests,
  useResolveVariableRequest,
  useAccountRequests,
  useResolveAccountRequest,
} from "@/hooks";
import { sanitizeConvexError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";

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

  const { requests: variableRequests, isLoading: isLoadingVariableRequests } =
    useVariableRequests(projectId, convexUserId);
  const { requests: accountRequests, isLoading: isLoadingAccountRequests } =
    useAccountRequests(projectId, convexUserId);
  const resolveRequest = useResolveVariableRequest();
  const resolveAccountRequest = useResolveAccountRequest();

  const isLoadingRequests =
    isLoadingVariableRequests || isLoadingAccountRequests;

  // Unified feed: variable + account requests interleaved, newest first.
  const requests = [
    ...variableRequests.map((request) => ({
      ...request,
      type: "variable" as const,
      label: request.key,
    })),
    ...accountRequests.map((request) => ({
      ...request,
      type: "account" as const,
      label: request.name,
    })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestPagination = usePagination(requests, { pageSize: 10 });

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  const handleCancel = async (request: {
    type: "variable" | "account";
    _id: string;
  }) => {
    if (!projectId || !convexUserId) return;
    setNotice(null);
    setError(null);
    try {
      if (request.type === "account") {
        await resolveAccountRequest.mutateAsync({
          requestId: request._id,
          action: "cancel",
        });
      } else {
        await resolveRequest.mutateAsync({
          requestId: request._id,
          action: "cancel",
          reviewedBy: convexUserId as string,
        });
      }
      setNotice("Request canceled.");
    } catch (err) {
      log.error(
        "project_request_cancel_failed",
        {
          projectId,
          requestId: request._id,
          type: request.type,
          reviewedBy: convexUserId,
          organizationId: organization?.id,
        },
        err
      );
      setError(sanitizeConvexError(err));
    }
  };

  // Account requests are reviewed inline here (variable requests keep their
  // org-wide review page at /dashboard/requests).
  const handleReviewAccountRequest = async (
    requestId: string,
    action: "approve" | "reject"
  ) => {
    setNotice(null);
    setError(null);
    try {
      await resolveAccountRequest.mutateAsync({ requestId, action });
      setNotice(
        `Account request ${action === "approve" ? "approved" : "rejected"}.`
      );
    } catch (err) {
      log.error(
        "project_account_request_review_failed",
        {
          projectId,
          requestId,
          action,
          organizationId: organization?.id,
        },
        err
      );
      setError(sanitizeConvexError(err));
    }
  };

  if (isLoadingProject) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <GitPullRequest className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {projectError instanceof Error
            ? projectError.message
            : "Project not found"}
        </h2>
        <Link
          href="/dashboard/projects"
          className="mt-6 text-sm font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
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
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-6 w-6 text-zinc-400" />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              Requests
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Member-submitted variable and account requests with approval
              history for {project.name}.
            </p>
          </div>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/20">
          <p className="text-sm text-green-700 dark:text-green-400">{notice}</p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/20">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {isLoadingRequests ? (
            <TerminalLoading />
          ) : requests.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No requests yet.
            </div>
          ) : (
            <>
              <AnimatedList
                className="divide-y divide-zinc-200 dark:divide-zinc-800"
                pageKey={requestPagination.currentPage}
              >
                {requestPagination.pageItems.map((request) => (
                  <div key={request._id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {request.label}
                          </code>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              request.type === "account"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            }`}
                          >
                            {request.type === "account"
                              ? "Account"
                              : "Variable"}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              request.status === "approved"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                : request.status === "rejected"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : request.status === "canceled"
                                    ? "bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300"
                                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}
                          >
                            {request.status}
                          </span>
                          {request.environments?.map((env: string) => (
                            <span
                              key={env}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                                env === "production"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                  : env === "staging"
                                    ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              }`}
                            >
                              {env}
                            </span>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                          Requested by{" "}
                          {request.requester?.name ??
                            request.requester?.email ??
                            "Unknown"}
                          {" · "}
                          {formatDate(request.createdAt)}
                        </p>
                        {request.description && (
                          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
                            {request.description}
                          </p>
                        )}
                        {request.reviewReason && (
                          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                            Review note: {request.reviewReason}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {canReviewRequests &&
                          request.status === "pending" &&
                          (request.type === "variable" ? (
                            <Link
                              href="/dashboard/requests"
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                            >
                              Review →
                            </Link>
                          ) : (
                            <>
                              <button
                                onClick={() =>
                                  handleReviewAccountRequest(
                                    request._id,
                                    "approve"
                                  )
                                }
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  handleReviewAccountRequest(
                                    request._id,
                                    "reject"
                                  )
                                }
                                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:text-red-400 dark:hover:bg-red-900/20"
                              >
                                Reject
                              </button>
                            </>
                          ))}
                        {!canReviewRequests &&
                          convexUserId &&
                          request.status === "pending" &&
                          request.requestedBy === convexUserId && (
                            <button
                              onClick={() => handleCancel(request)}
                              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
