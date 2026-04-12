"use client";

import { useState, use } from "react";
import Link from "next/link";
import type { Id } from "@convex/_generated/dataModel";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";
import { useVariableSelectionStore } from "@/stores/variable-selection-store";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, parseBinding } from "@/hooks/useKeyboardShortcuts";
import { useAuthContext } from "@/components/auth";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { usePagination } from "@/hooks";
import { ENVIRONMENTS, DEFAULT_PROJECT_COLOR } from "@/constants/project";
import { ProjectIcon } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui";
import {
  VariableCreateDrawer,
  VariableEditModal,
  VariableHistory,
  VariableListItem,
  ExportDialog,
  ImportDialog,
  ShareSecretDrawer,
  TagFilter,
  type VariableFormData,
} from "@/components/variables";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { ApiError } from "@/lib/api-client";
import {
  useProjectBySlug,
  useVariablesList,
  useVariableHistory,
  useCreateVariable,
  useUpdateVariable,
  useDeleteVariable,
  useBulkDeleteVariables,
  useRollbackVariable,
  useCurrentUser,
  useOrganizationTags,
  useCreateTag,
} from "@/hooks/queries";
import {
  useVariableRequestsList,
  useResolveVariableRequest,
} from "@/hooks/queries";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
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
  vaultRef?: string;
  permission?: "read" | "write" | "admin" | null;
  rotationFrequencyDays?: number;
  expiresAt?: number;
  rotationStatus?: "active" | "expiring_soon" | "expired";
  tagIds?: string[];
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
  const { canDo, organization } = useAuthContext();
  const canCreateVariable = canDo("org:create_project");
  const canUpdateVariable = canDo("org:create_project");
  const canDeleteVariable = canDo("org:create_project");
  const canReviewRequests = canDo("org:create_project");
  const canRequestVariable = organization?.role === "member";

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { allowed: showRotation } = useFeatureGate(orgId, "secret_rotation");
  const { allowed: canShare } = useFeatureGate(orgId, "secret_sharing");
  const { allowed: showTags } = useFeatureGate(orgId, "variable_tags");
  const { data: tagsData } = useOrganizationTags(organization?.id, {
    enabled: showTags,
  });
  const createTag = useCreateTag();
  const orgTags = showTags ? (tagsData?.tags ?? []) : [];

  // Variable selection store for bulk operations
  const {
    selectedIds,
    isSelectionMode,
    isBulkDeleting,
    showConfirmDialog: showBulkDeleteConfirm,
    toggleSelect,
    selectAll,
    clearSelection,
    exitSelectionMode,
    setBulkDeleting,
    setShowConfirmDialog: setShowBulkDeleteConfirm,
  } = useVariableSelectionStore();

  // Keyboard shortcut: Cmd/Ctrl+Shift+K to open Add Variable drawer (respects custom bindings)
  const customBindings = useKeyboardStore((s) => s.customBindings);
  const addVarKeys = customBindings.ADD_VARIABLE ?? SHORTCUTS.ADD_VARIABLE.keys;
  const addVarBinding = parseBinding(addVarKeys);

  useHotkey(
    addVarBinding.type === "single"
      ? (addVarBinding.hotkey as Hotkey)
      : ("F24" as Hotkey),
    (e) => {
      e.preventDefault();
      if (canCreateVariable || canRequestVariable) {
        setShowCreateModal(true);
      }
    },
    { enabled: addVarBinding.type === "single" }
  );

  useHotkeySequence(
    addVarBinding.type === "sequence"
      ? (addVarBinding.keys as unknown as HotkeySequence)
      : (["Unidentified", "Unidentified"] as unknown as HotkeySequence),
    () => {
      if (canCreateVariable || canRequestVariable) {
        setShowCreateModal(true);
      }
    },
    { enabled: addVarBinding.type === "sequence" }
  );

  // --- TanStack Query: data fetching ---
  const { data: currentUser } = useCurrentUser();
  const convexUserId = (currentUser?.convexUserId as Id<"users">) ?? null;

  const {
    data: project,
    isLoading,
    error: projectError,
  } = useProjectBySlug(orgId, slug);

  const projectId = project?._id as Id<"projects"> | undefined;

  const { data: variablesData, isLoading: isLoadingVariables } =
    useVariablesList(projectId);
  const variables = (variablesData?.variables ?? []) as Variable[];

  const { data: requestsData } = useVariableRequestsList(projectId);
  const requests = requestsData?.requests ?? [];

  // --- TanStack Query: mutations ---
  const createVariable = useCreateVariable();
  const updateVariable = useUpdateVariable();
  const deleteVariable = useDeleteVariable();
  const bulkDelete = useBulkDeleteVariables();
  const rollbackVariable = useRollbackVariable();
  const resolveRequest = useResolveVariableRequest();

  // --- Local UI state ---
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showExportDrawer, setShowExportDrawer] = useState(false);
  const [showImportDrawer, setShowImportDrawer] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [deletingVariable, setDeletingVariable] = useState<Variable | null>(
    null
  );

  // Share drawer state
  const [sharingVariable, setSharingVariable] = useState<Variable | null>(null);

  // History modal state
  const [historyVariableId, setHistoryVariableId] = useState<string | null>(
    null
  );
  const [historyVariableKey, setHistoryVariableKey] = useState<string>("");
  const [historyVariableVersion, setHistoryVariableVersion] =
    useState<number>(0);
  const {
    data: historyData,
    isLoading: isLoadingHistory,
    error: historyQueryError,
  } = useVariableHistory(historyVariableId ?? undefined, {
    enabled: !!historyVariableId,
  });

  // Reveal value state
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !projectId) return;

    setBulkDeleting(true);
    setNotice(null);
    setError(null);

    try {
      const result = await bulkDelete.mutateAsync({
        variableIds: Array.from(selectedIds),
        projectId,
      });

      setNotice(
        `Successfully deleted ${result.deletedCount} variable${result.deletedCount !== 1 ? "s" : ""}.`
      );
      exitSelectionMode();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete variables"
      );
    } finally {
      setBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const handleCreateVariable = async (data: VariableFormData) => {
    if (!projectId) return;
    setNotice(null);
    setError(null);

    try {
      const result = await createVariable.mutateAsync({
        key: data.key,
        value: data.value,
        description: data.description || undefined,
        environments: data.environments,
        projectId,
        isSensitive: data.isSensitive,
        rotationFrequencyDays: data.rotationFrequencyDays,
        tagIds: data.tagIds,
      });

      if (result.requested) {
        setNotice("Variable request submitted for admin approval.");
      } else {
        setNotice("Variable created successfully.");
      }
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === "TIER_LIMIT_REACHED"
          ? "Variable limit reached. Upgrade to Pro for unlimited variables."
          : err instanceof Error
            ? err.message
            : "Failed to create variable";
      setError(message);
      throw err;
    }
  };

  const handleUpdateVariable = async (
    variableId: Id<"environmentVariables">,
    data: VariableFormData
  ) => {
    if (!projectId) return;
    setNotice(null);
    setError(null);

    try {
      await updateVariable.mutateAsync({
        variableId,
        projectId,
        value: data.value || undefined,
        description: data.description || undefined,
        environments: data.environments,
        isSensitive: data.isSensitive,
        changeReason: "Updated via dashboard",
        rotationFrequencyDays: data.rotationFrequencyDays,
        tagIds: data.tagIds,
      });

      setNotice("Variable updated successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to update variable";
      setError(message);
      throw err;
    }
  };

  const handleDeleteVariable = async () => {
    if (!deletingVariable || !projectId) return;

    setNotice(null);
    setError(null);
    try {
      await deleteVariable.mutateAsync({
        variableId: deletingVariable._id,
        projectId,
      });

      setDeletingVariable(null);
      setNotice("Variable deleted successfully.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to delete variable";
      setError(message);
      throw err;
    }
  };

  const handleViewHistory = (variable: Variable) => {
    setHistoryVariableId(variable._id);
    setHistoryVariableKey(variable.key);
    setHistoryVariableVersion(variable.version);
  };

  const handleRollback = async (targetVersion: number) => {
    if (!historyVariableId || !projectId) return;

    try {
      await rollbackVariable.mutateAsync({
        variableId: historyVariableId,
        projectId,
        targetVersion,
      });

      setNotice(
        `Rolled back ${historyVariableKey} to version ${targetVersion}.`
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to rollback variable"
      );
    }
  };

  const updateRequestStatus = async (
    requestId: Id<"environmentVariableRequests">,
    action: "approve" | "reject" | "cancel"
  ) => {
    if (!projectId) return;
    setNotice(null);
    setError(null);
    try {
      await resolveRequest.mutateAsync({
        requestId,
        projectId,
        action,
      });

      setNotice(
        action === "approve"
          ? "Request approved and variable created."
          : action === "reject"
            ? "Request rejected."
            : "Request canceled."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : `Failed to ${action} request`
      );
    }
  };

  const handleRevealValue = async (variable: Variable) => {
    if (revealedValues[variable._id]) return;
    if (!variable.vaultRef || !organization?.id) return;

    setRevealingIds((prev) => new Set(prev).add(variable._id));
    try {
      const res = await fetch(
        `/api/vault?vaultRef=${encodeURIComponent(variable.vaultRef)}&organizationId=${encodeURIComponent(organization.id)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to read secret");
      setRevealedValues((prev) => ({
        ...prev,
        [variable._id]: data.data.value,
      }));
    } catch {
      setError("Failed to reveal variable value.");
    } finally {
      setRevealingIds((prev) => {
        const next = new Set(prev);
        next.delete(variable._id);
        return next;
      });
    }
  };

  const filteredVariables = variables.filter((v) => {
    // Environment filter
    if (
      selectedEnvironment !== "all" &&
      !v.environments.includes(selectedEnvironment)
    ) {
      return false;
    }
    // Tag filter (OR logic within selected tags)
    if (selectedTags.length > 0) {
      if (!v.tagIds || !v.tagIds.some((id) => selectedTags.includes(id))) {
        return false;
      }
    }
    return true;
  });

  const variablePagination = usePagination(filteredVariables, { pageSize: 10 });
  const requestPagination = usePagination(requests, { pageSize: 5 });

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(timestamp));

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
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
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-lg"
            style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
          >
            <ProjectIcon icon={project.icon} size={24} />
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
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/projects/${project.slug}/diff`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                d="M9 5l7 7-7 7"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 5l7 7-7 7"
              />
            </svg>
            Compare
          </Link>
          <Link
            href={`/dashboard/projects/${project.slug}/members`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Members
          </Link>
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

      <div className="flex flex-wrap items-center gap-4">
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
        {showTags && orgTags.length > 0 && (
          <TagFilter
            tags={orgTags}
            selectedTagIds={selectedTags}
            onToggleTag={(tagId) =>
              setSelectedTags((prev) =>
                prev.includes(tagId)
                  ? prev.filter((id) => id !== tagId)
                  : [...prev, tagId]
              )
            }
            onClearAll={() => setSelectedTags([])}
          />
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">
              Environment Variables
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {filteredVariables.length} variable
              {filteredVariables.length !== 1 ? "s" : ""}
              {selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export Button */}
            <button
              onClick={() => setShowExportDrawer(true)}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export
            </button>

            {/* Import Button */}
            {canCreateVariable && (
              <button
                onClick={() => setShowImportDrawer(true)}
                className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                  />
                </svg>
                Import
              </button>
            )}

            {/* Add Variable Button */}
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
                <kbd className="ml-1.5 hidden rounded bg-white/20 px-1.5 py-0.5 text-xs font-normal sm:inline-block">
                  {typeof navigator !== "undefined" &&
                  /Mac/.test(navigator.userAgent)
                    ? "⌘⇧K"
                    : "Ctrl+Shift+K"}
                </kbd>
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {isLoadingVariables ? (
            <TerminalLoading />
          ) : filteredVariables.length === 0 ? (
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
            <>
              <AnimatedList
                className="divide-y divide-zinc-200 dark:divide-zinc-800"
                pageKey={variablePagination.currentPage}
              >
                {variablePagination.pageItems.map((variable) => (
                  <VariableListItem
                    key={variable._id}
                    variable={{
                      ...variable,
                      tags: variable.tagIds
                        ?.map((id) => orgTags.find((t) => t._id === id))
                        .filter(Boolean) as
                        | Array<{ _id: string; name: string; color: string }>
                        | undefined,
                    }}
                    onEdit={() => setEditingVariable(variable)}
                    onDelete={() => setDeletingVariable(variable)}
                    onViewHistory={() => handleViewHistory(variable)}
                    onReveal={() => handleRevealValue(variable)}
                    revealedValue={revealedValues[variable._id] ?? null}
                    isRevealing={revealingIds.has(variable._id)}
                    canEdit={canUpdateVariable}
                    canDelete={canDeleteVariable}
                    permissionLevel={variable.permission ?? null}
                    onShare={
                      canShare ? () => setSharingVariable(variable) : undefined
                    }
                    showCheckbox={canDeleteVariable}
                    isSelected={selectedIds.has(variable._id)}
                    onToggleSelect={() => toggleSelect(variable._id)}
                  />
                ))}
              </AnimatedList>
              <Pagination
                currentPage={variablePagination.currentPage}
                totalPages={variablePagination.totalPages}
                hasNextPage={variablePagination.hasNextPage}
                hasPrevPage={variablePagination.hasPrevPage}
                onNextPage={variablePagination.nextPage}
                onPrevPage={variablePagination.prevPage}
                onGoToPage={variablePagination.goToPage}
                startIndex={variablePagination.startIndex}
                endIndex={variablePagination.endIndex}
                totalItems={variablePagination.totalItems}
              />
            </>
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
                                updateRequestStatus(
                                  request._id as Id<"environmentVariableRequests">,
                                  "approve"
                                )
                              }
                              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() =>
                                updateRequestStatus(
                                  request._id as Id<"environmentVariableRequests">,
                                  "reject"
                                )
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
                                updateRequestStatus(
                                  request._id as Id<"environmentVariableRequests">,
                                  "cancel"
                                )
                              }
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

      <VariableCreateDrawer
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateVariable}
        organizationId={organization?.id}
        projectId={project?._id}
        title={canCreateVariable ? "Add Variables" : "Request Variables"}
        submitLabel={canCreateVariable ? "Create Variable" : "Submit Request"}
      />

      <VariableEditModal
        isOpen={!!editingVariable}
        onClose={() => setEditingVariable(null)}
        variable={editingVariable}
        onSave={handleUpdateVariable}
        showRotation={showRotation}
        availableTags={orgTags}
        onCreateTag={
          showTags
            ? async (name, color) => {
                if (!organization?.id) return;
                await createTag.mutateAsync({
                  organizationId: organization.id,
                  name,
                  color,
                });
              }
            : undefined
        }
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

      {/* Export Drawer */}
      {projectId && (
        <ExportDialog
          isOpen={showExportDrawer}
          onClose={() => setShowExportDrawer(false)}
          projectId={projectId}
          projectName={project?.name || "project"}
          organizationId={orgId}
        />
      )}

      {/* Import Drawer */}
      {projectId && (
        <ImportDialog
          isOpen={showImportDrawer}
          onClose={() => setShowImportDrawer(false)}
          projectId={projectId}
          organizationId={orgId}
        />
      )}

      {/* Bulk Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Bulk Delete Variables"
        message={`Are you sure you want to delete ${selectedIds.size} variable${selectedIds.size !== 1 ? "s" : ""}? This action cannot be undone.`}
        confirmText={isBulkDeleting ? "Deleting..." : "Delete All"}
        variant="danger"
      />

      {/* Floating Bulk Action Bar */}
      {isSelectionMode && selectedIds.size > 0 && (
        <FeatureGate
          organizationId={orgId}
          featureKey="bulk_delete"
          featureName="Bulk Delete"
          fallbackVariant="inline"
        >
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 shadow-2xl">
              <span className="text-sm font-medium text-zinc-300">
                {selectedIds.size} variable{selectedIds.size !== 1 ? "s" : ""}{" "}
                selected
              </span>
              <button
                onClick={() => selectAll(filteredVariables.map((v) => v._id))}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                Clear
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isBulkDeleting}
                className="rounded-lg bg-red-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Delete Selected
              </button>
            </div>
          </div>
        </FeatureGate>
      )}

      {historyVariableId && (
        <FeatureGate
          organizationId={orgId}
          featureKey="variable_version_history"
          featureName="Version History"
          fallbackVariant="inline"
        >
          <VariableHistory
            isOpen={!!historyVariableId}
            onClose={() => {
              setHistoryVariableId(null);
              setHistoryVariableKey("");
              setHistoryVariableVersion(0);
            }}
            variableKey={historyVariableKey}
            currentVersion={historyVariableVersion}
            history={(historyData?.history ?? []) as VersionRecord[]}
            onRollback={handleRollback}
            canRollback={canDo("org:delete_project")}
            isLoading={isLoadingHistory}
            error={
              historyQueryError
                ? "Failed to load version history. Please try again."
                : null
            }
          />
        </FeatureGate>
      )}

      {/* Share Secret Drawer */}
      {sharingVariable && projectId && orgId && (
        <ShareSecretDrawer
          isOpen={!!sharingVariable}
          onClose={() => setSharingVariable(null)}
          variable={sharingVariable}
          organizationId={orgId}
          projectId={projectId}
          onRevealValue={async () => {
            if (!sharingVariable.vaultRef || !organization?.id) return null;
            const res = await fetch(
              `/api/vault?vaultRef=${encodeURIComponent(sharingVariable.vaultRef)}&organizationId=${encodeURIComponent(organization.id)}`
            );
            const data = await res.json();
            if (!res.ok) return null;
            return data.data.value;
          }}
        />
      )}
    </div>
  );
}
