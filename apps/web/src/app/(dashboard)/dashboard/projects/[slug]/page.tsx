"use client";

import { useState, useEffect, use, useCallback } from "react";
import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import { useAuthContext } from "@/components/auth";
import { PERMISSIONS } from "@/lib/auth";
import {
  ENVIRONMENTS,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_COLOR,
} from "@/constants/project";
import { ConfirmDialog } from "@/components/ui";
import {
  VariableCreateModal,
  VariableEditModal,
  VariableHistory,
  VariableListItem,
  type VariableFormData,
} from "@/components/variables";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

interface Project {
  _id: Id<"projects">;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  organizationId: Id<"organizations">;
  createdAt: number;
  updatedAt: number;
}

interface Variable {
  _id: Id<"environmentVariables">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  version: number;
  createdAt: number;
  updatedAt: number;
  permission?: "read" | "write" | "admin" | null;
}

interface VariableRequest {
  _id: Id<"environmentVariableRequests">;
  key: string;
  description?: string;
  environments: string[];
  isSensitive: boolean;
  status: "pending" | "approved" | "rejected" | "canceled";
  reviewReason?: string;
  requestedBy: Id<"users">;
  reviewedBy?: Id<"users">;
  reviewedAt?: number;
  createdVariableId?: Id<"environmentVariables">;
  createdAt: number;
  updatedAt: number;
  requester: { _id: Id<"users">; email: string; name?: string } | null;
  reviewer: { _id: Id<"users">; email: string; name?: string } | null;
}

interface VersionRecord {
  _id: Id<"variableVersions">;
  version: number;
  description?: string;
  environments: string[];
  changeReason?: string;
  createdAt: number;
  changedByUser: { name?: string; email: string } | null;
}

export default function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = use(params);
  const { hasPermission, organization } = useAuthContext();
  const canCreateVariable = hasPermission(PERMISSIONS.VARIABLE_CREATE);
  const canUpdateVariable = hasPermission(PERMISSIONS.VARIABLE_UPDATE);
  const canDeleteVariable = hasPermission(PERMISSIONS.VARIABLE_DELETE);
  const canReviewRequests = hasPermission(PERMISSIONS.VARIABLE_CREATE);
  const canRequestVariable = organization?.role === "member";

  const [project, setProject] = useState<Project | null>(null);
  const [variables, setVariables] = useState<Variable[]>([]);
  const [requests, setRequests] = useState<VariableRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingVariables, setIsLoadingVariables] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(
    null,
  );
  const [historyVariable, setHistoryVariable] = useState<Variable | null>(null);
  const [variableHistory, setVariableHistory] = useState<VersionRecord[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // User state (for request cancellation)
  const [convexUserId, setConvexUserId] = useState<Id<"users"> | null>(null);

  useEffect(() => {
    async function fetchUser() {
      try {
        const response = await fetch("/api/users/me");
        const data = await response.json();
        if (data.convexUserId) {
          setConvexUserId(data.convexUserId);
        }
      } catch {
        // No-op
      }
    }
    fetchUser();
  }, []);

  useEffect(() => {
    async function fetchProject() {
      try {
        if (!organization?.id) {
          setError("No organization found");
          setIsLoading(false);
          return;
        }

        const projectsResponse = await fetch(
          `/api/projects?organizationId=${organization.id}`,
        );
        const projectsData = await projectsResponse.json();
        const foundProject = projectsData.projects?.find(
          (p: Project) => p.slug === slug,
        );

        if (!foundProject) {
          setError("Project not found");
        } else {
          setProject(foundProject);
        }
      } catch {
        setError("Failed to load project");
      } finally {
        setIsLoading(false);
      }
    }

    fetchProject();
  }, [organization?.id, slug]);

  const fetchVariables = useCallback(async () => {
    if (!project) return;

    setIsLoadingVariables(true);
    try {
      const params = new URLSearchParams({ projectId: project._id });
      if (selectedEnvironment !== "all") {
        params.set("environment", selectedEnvironment);
      }

      const response = await fetch(`/api/variables?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load variables");
      }

      setVariables(data.variables || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load variables");
    } finally {
      setIsLoadingVariables(false);
    }
  }, [project, selectedEnvironment]);

  const fetchRequests = useCallback(async () => {
    if (!project) return;

    try {
      const response = await fetch(
        `/api/variable-requests?projectId=${project._id}`,
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to load variable requests");
      }
      setRequests(data.requests || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load variable requests",
      );
    }
  }, [project]);

  useEffect(() => {
    fetchVariables();
  }, [fetchVariables]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const refreshProjectData = async () => {
    await Promise.all([fetchVariables(), fetchRequests()]);
  };

  const handleCreateVariable = async (data: VariableFormData) => {
    if (!project) return;
    setNotice(null);
    setError(null);

    try {
      const response = await fetch("/api/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: data.key,
          value: data.value,
          description: data.description || undefined,
          environments: data.environments,
          projectId: project._id,
          isSensitive: data.isSensitive,
        }),
      });

      const result = await response.json();
      if (!response.ok && response.status !== 202) {
        throw new Error(result.error || "Failed to create variable");
      }

      if (response.status === 202 || result.requested) {
        setNotice("Variable request submitted for admin approval.");
      } else {
        setNotice("Variable created successfully.");
      }

      await refreshProjectData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create variable";
      setError(message);
      throw err;
    }
  };

  const handleUpdateVariable = async (
    variableId: Id<"environmentVariables">,
    data: VariableFormData,
  ) => {
    setNotice(null);
    setError(null);

    try {
      const response = await fetch(`/api/variables/${variableId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: data.value || undefined,
          description: data.description || undefined,
          environments: data.environments,
          isSensitive: data.isSensitive,
          changeReason: "Updated via dashboard",
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to update variable");
      }

      setNotice("Variable updated successfully.");
      await refreshProjectData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update variable";
      setError(message);
      throw err;
    }
  };

  const handleDeleteVariable = async () => {
    if (!deletingVariable) return;

    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/variables/${deletingVariable._id}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to delete variable");
      }

      setDeletingVariable(null);
      setNotice("Variable deleted successfully.");
      await refreshProjectData();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete variable";
      setError(message);
      throw err;
    }
  };

  const handleViewHistory = async (variable: Variable) => {
    setHistoryVariable(variable);
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const response = await fetch(`/api/variables/${variable._id}/history`);
      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`);
      }
      const data = await response.json();
      setVariableHistory(data.history || []);
    } catch (err) {
      setHistoryError("Failed to load version history. Please try again.");
      setVariableHistory([]);
      console.error("History fetch error:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleRollback = async (targetVersion: number) => {
    if (!historyVariable) return;

    try {
      const response = await fetch(
        `/api/variables/${historyVariable._id}/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetVersion }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Failed to rollback variable");
      }

      setNotice(
        `Rolled back ${historyVariable.key} to version ${targetVersion}.`,
      );
      await refreshProjectData();
      await handleViewHistory(historyVariable);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Failed to rollback variable",
      );
    }
  };

  const updateRequestStatus = async (
    requestId: Id<"environmentVariableRequests">,
    action: "approve" | "reject" | "cancel",
  ) => {
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/variable-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Failed to ${action} request`);
      }

      setNotice(
        action === "approve"
          ? "Request approved and variable created."
          : action === "reject"
            ? "Request rejected."
            : "Request canceled.",
      );
      await refreshProjectData();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${action} request`,
      );
    }
  };

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full bg-red-100 p-3 dark:bg-red-900/20">
          <svg
            className="h-6 w-6 text-red-600 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {error || "Project not found"}
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

  if (!project) return null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/projects"
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
          </Link>
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg text-xl"
            style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
          >
            {project.icon || DEFAULT_PROJECT_ICON}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {project.name}
            </h1>
            {project.description && (
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {project.description}
              </p>
            )}
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

      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Environment:
        </label>
        <div className="flex gap-2">
          <button
            onClick={() => setSelectedEnvironment("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedEnvironment === "all"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            All
          </button>
          {ENVIRONMENTS.map((env) => (
            <button
              key={env}
              onClick={() => setSelectedEnvironment(env)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                selectedEnvironment === env
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Environment Variables
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {variables.length} variable{variables.length !== 1 ? "s" : ""}
              {selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
            </p>
          </div>
          {(canCreateVariable || canRequestVariable) && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              {canCreateVariable ? "Add Variable" : "Request Variable"}
            </button>
          )}
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {isLoadingVariables ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
            </div>
          ) : variables.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <svg
                  className="h-6 w-6 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                  />
                </svg>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                No variables yet
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {canCreateVariable
                  ? "Add your first environment variable to get started."
                  : "No variables available for this environment."}
              </p>
            </div>
          ) : (
            variables.map((variable) => (
              <VariableListItem
                key={variable._id}
                variable={variable}
                onEdit={() => setEditingVariable(variable)}
                onDelete={() => setDeletingVariable(variable)}
                onViewHistory={() => handleViewHistory(variable)}
                canEdit={canUpdateVariable}
                canDelete={canDeleteVariable}
                permissionLevel={variable.permission ?? null}
              />
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
            Variable Requests
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Member-submitted variable changes with approval history.
          </p>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {requests.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              No requests yet.
            </div>
          ) : (
            requests.map((request) => (
              <div key={request._id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {request.key}
                      </code>
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
                    {canReviewRequests && request.status === "pending" && (
                      <>
                        <button
                          onClick={() =>
                            updateRequestStatus(request._id, "approve")
                          }
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() =>
                            updateRequestStatus(request._id, "reject")
                          }
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {!canReviewRequests &&
                      convexUserId &&
                      request.status === "pending" &&
                      request.requestedBy === convexUserId && (
                        <button
                          onClick={() =>
                            updateRequestStatus(request._id, "cancel")
                          }
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <VariableCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateVariable}
        title={canCreateVariable ? "Create Variable" : "Request Variable"}
        submitLabel={canCreateVariable ? "Create Variable" : "Submit Request"}
      />

      <VariableEditModal
        isOpen={!!editingVariable}
        onClose={() => setEditingVariable(null)}
        variable={editingVariable}
        onSave={handleUpdateVariable}
      />

      <ConfirmDialog
        isOpen={!!deletingVariable}
        onClose={() => setDeletingVariable(null)}
        onConfirm={handleDeleteVariable}
        title="Delete Variable"
        message={`Are you sure you want to delete "${deletingVariable?.key}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
      />

      {historyVariable && (
        <VariableHistory
          isOpen={!!historyVariable}
          onClose={() => {
            setHistoryVariable(null);
            setVariableHistory([]);
            setHistoryError(null);
          }}
          variableKey={historyVariable.key}
          currentVersion={historyVariable.version}
          history={variableHistory}
          onRollback={handleRollback}
          canRollback={hasPermission(PERMISSIONS.VARIABLE_ROLLBACK)}
          isLoading={isLoadingHistory}
          error={historyError}
        />
      )}
    </div>
  );
}
