"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { PageHeader } from "@envpilot/ui";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { toast } from "sonner";
import type { Hotkey, HotkeySequence } from "@tanstack/react-hotkeys";
import { useVariableSelectionStore } from "@/stores/variable-selection-store";
import { useKeyboardStore } from "@/stores/keyboard-store";
import { SHORTCUTS, parseBinding } from "@/hooks/useKeyboardShortcuts";
import { useAuthContext } from "@/components/auth";
import {
  TerminalLoading,
  TerminalInput,
} from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import {
  useProjectBySlug,
  useConvexUser,
  useOrganizationTags,
  useCreateTag,
} from "@/hooks";
import { useVariableHistory as useConvexVariableHistory } from "@/hooks";
import { ENVIRONMENTS, DEFAULT_PROJECT_COLOR } from "@/constants/project";
import { ConfirmDialog, ProjectIcon } from "@/components/ui";
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
import { BulkJobStatusLine } from "@/components/variables/BulkJobStatusLine";
import { useRevealSecret } from "@/hooks/useRevealSecret";
import { FeatureGate } from "@/components/tier/FeatureGate";
import { useFeatureGate } from "@/hooks/useFeatureGate";
import { useIsMacPlatform } from "@/hooks/useIsMacPlatform";
import { sanitizeConvexError, isTierLimitError } from "@/lib/error-messages";
import { createLogger } from "@/lib/logger";
import {
  useCreateVariable,
  useUpdateVariable,
  useDeleteVariable,
  useBulkDeleteVariables,
  useRollbackVariable,
} from "@/hooks/queries";

const log = createLogger("app/dashboard/project-detail");

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
  permission?: "read" | "write" | null;
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
  const { canDo, organization, user, capabilities } = useAuthContext();
  // Project actions follow the caller's resolved registry profile so custom
  // roles receive the same gates the Convex authorization layer enforces.
  const canCreateVariable = capabilities["project.variables.create"] === true;
  const canUpdateVariable = capabilities["project.variables.update"] === true;
  const canDeleteVariable = capabilities["project.variables.delete"] === true;
  const canSeeTrash =
    canDeleteVariable || capabilities["project.read"] === true;
  // Read access keeps the trash recovery route available to members who may
  // need to restore content they previously deleted.
  const canRequestVariable = capabilities["project.requests.submit"] === true;

  const orgId = organization?.id as Id<"organizations"> | undefined;
  const { allowed: showRotation } = useFeatureGate(orgId, "secret_rotation");
  const { allowed: canShare } = useFeatureGate(orgId, "secret_sharing");
  const { allowed: showTags } = useFeatureGate(orgId, "variable_tags");
  const { tags: tagsData } = useOrganizationTags(
    showTags ? organization?.id : undefined
  );
  const createTag = useCreateTag();
  const orgTags = showTags ? tagsData : [];

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

  // Declared above the hotkey registrations that call it: the handlers
  // close over the setter, so keeping the declaration below them reads as
  // use-before-declare even though it only runs on a key press.
  const [showCreateModal, setShowCreateModal] = useState(false);

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
    addVarBinding.type === "sequence"
      ? { enabled: true }
      : { enabled: false, conflictBehavior: "allow" }
  );

  // --- Convex: real-time data fetching (direct WebSocket, no API proxy) ---
  const { convexUserId } = useConvexUser(user?.id);

  const project = useProjectBySlug(orgId, slug);
  const isLoading = project === undefined && !!slug;
  const projectError = project === null ? new Error("Project not found") : null;

  const projectId = project?._id as Id<"projects"> | undefined;

  // Convex cursor pagination: `results` accumulates every loaded page.
  // All downstream filtering (env tab, tags), reveal, and per-variable
  // access flags operate over this accumulated array, unchanged.
  const {
    results: rawVariables,
    status: variablesStatus,
    loadMore: loadMoreVariables,
  } = usePaginatedQuery(
    api.features.variables.queries.listWithAccessPaginated,
    // Identity is derived server-side from the attached JWT; `convexUserId`
    // gates the query until the current user is known (auth ready).
    projectId && convexUserId ? { projectId } : "skip",
    { initialNumItems: 50 }
  );
  const isLoadingVariables = variablesStatus === "LoadingFirstPage";
  const variables = rawVariables as Variable[];

  // --- TanStack Query: mutations ---
  const createVariable = useCreateVariable();
  const updateVariable = useUpdateVariable();
  const deleteVariable = useDeleteVariable();
  const bulkDelete = useBulkDeleteVariables();
  const rollbackVariable = useRollbackVariable();
  const revealSecret = useRevealSecret();

  // --- Local UI state ---
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Per-project search: 300ms debounce (useGlobalSearch pattern). A non-empty
  // term switches the list source to the server-side searchInProject query
  // (COMPLETE — every active variable, not just loaded pages); empty term
  // falls back to the paginated list exactly as before.
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const trimmedSearch = debouncedSearch.trim();
  const isSearching = trimmedSearch.length >= 1;
  const searchData = useQuery(
    api.features.variables.queries.searchInProject,
    // Identity is derived server-side; gate until user + project known and a
    // term is present. The env tab composes as the `environment` arg.
    projectId && convexUserId && isSearching
      ? {
          projectId,
          searchTerm: trimmedSearch,
          environment:
            selectedEnvironment === "all" ? undefined : selectedEnvironment,
        }
      : "skip"
  );
  const isSearchLoading = isSearching && searchData === undefined;

  // Modal states
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
  const rawHistory = useConvexVariableHistory(
    historyVariableId
      ? (historyVariableId as Id<"environmentVariables">)
      : undefined,
    convexUserId
  );
  const historyData = rawHistory
    ? { history: rawHistory as VersionRecord[] }
    : undefined;
  const isLoadingHistory = !!historyVariableId && rawHistory === undefined;
  const historyQueryError = null;

  // Reveal value state
  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  // Server render and hydration both read the Ctrl label, then React swaps in
  // the real platform as part of the hydration commit. An effect would do the
  // same swap one paint later, which every Mac user would see.
  const isMacPlatform = useIsMacPlatform();

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
      log.error(
        "project_bulk_delete_failed",
        {
          projectId,
          selectedCount: selectedIds.size,
          organizationId: organization?.id,
        },
        err
      );
      setError(
        err instanceof Error ? err.message : "Failed to delete variables"
      );
    }
    // After the try/catch, not in a `finally`. One finalizer anywhere in this
    // component makes React Compiler bail on the WHOLE component, so the two
    // handlers here have to agree. The catch swallows and no branch inside
    // the try returns early.
    setBulkDeleting(false);
    setShowBulkDeleteConfirm(false);
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
      // Convex redacts plain Error messages to "Server Error" in production,
      // so the readable text only survives inside a ConvexError payload.
      // sanitizeConvexError unwraps it; the classifiers read the result.
      const raw = sanitizeConvexError(err);
      const message = isTierLimitError(raw)
        ? "Variable limit reached. Upgrade to Pro for unlimited variables."
        : // A conflict names the clashing environment(s) — surface it
          // verbatim (same key across DIFFERENT environments is legal).
          raw || "Failed to create variable";
      log.error(
        "project_variable_create_failed",
        {
          projectId,
          organizationId: organization?.id,
          key: data.key,
          environments: data.environments,
        },
        err
      );
      setError(message);
      // Re-throw with the friendly message — the create drawer's form shows
      // err.message in its inline banner, never the raw backend text.
      throw new Error(message);
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
        // Send "" through (not undefined) so a cleared description is
        // actually removed server-side — see convex/variables.ts update.
        description: data.description,
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
      log.error(
        "project_variable_update_failed",
        {
          projectId,
          variableId,
          organizationId: organization?.id,
          environments: data.environments,
        },
        err
      );
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
      log.error(
        "project_variable_delete_failed",
        {
          projectId,
          variableId: deletingVariable._id,
          organizationId: organization?.id,
        },
        err
      );
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
      const { valueRestored } = await rollbackVariable.mutateAsync({
        variableId: historyVariableId,
        projectId,
        targetVersion,
      });

      setNotice(
        `Rolled back ${historyVariableKey} to version ${targetVersion}.`
      );

      if (valueRestored) {
        toast.success(`Rolled back to version ${targetVersion}`, {
          description: "Value and settings restored.",
        });
      } else {
        toast.warning(
          `Rolled back to version ${targetVersion} — settings only`,
          {
            description:
              "This version predates value history, so the secret value could not be restored and is unchanged.",
          }
        );
      }
    } catch (err) {
      log.error(
        "project_variable_rollback_failed",
        {
          projectId,
          variableId: historyVariableId,
          targetVersion,
          organizationId: organization?.id,
        },
        err
      );
      const message =
        err instanceof Error ? err.message : "Failed to rollback variable";
      setError(message);
      toast.error(message);
    }
  };

  const handleRevealValue = async (variable: Variable) => {
    if (revealedValues[variable._id]) return;
    if (!variable.vaultRef || !organization?.id) return;

    setRevealingIds((prev) => new Set(prev).add(variable._id));
    try {
      // Over the Convex socket, so the whole "an expired session redirects
      // this fetch to the HTML sign-in page and res.json() chokes on '<'"
      // problem does not exist: there is no redirect to follow and no
      // content-type to sniff. Convex reports auth failure as an error.
      const value = await revealSecret(variable.vaultRef);
      setRevealedValues((prev) => ({
        ...prev,
        [variable._id]: value,
      }));
    } catch (err) {
      log.error(
        "project_variable_reveal_failed",
        {
          projectId,
          variableId: variable._id,
          organizationId: organization.id,
          vaultRef: variable.vaultRef,
        },
        err
      );
      setError("Failed to reveal variable value.");
    }
    // Cleared after the try/catch rather than in a `finally`: React Compiler
    // bails on the whole component when a try carries a finalizer. The catch
    // swallows and no branch inside the try returns early, so both paths
    // reach here.
    setRevealingIds((prev) => {
      const next = new Set(prev);
      next.delete(variable._id);
      return next;
    });
  };

  // Search mode swaps the source to server results (already env-filtered by
  // the `environment` arg); the paginated list keeps client-side env filtering.
  // Tag filtering stays client-side in both modes.
  const baseVariables = isSearching
    ? ((searchData?.results ?? []) as Variable[])
    : variables;
  // Built once instead of scanning the tag list per tag per rendered row.
  const tagsById = new Map(orgTags.map((tag) => [tag._id, tag]));
  const selectedTagIds = new Set(selectedTags);

  const filteredVariables = baseVariables.filter((v) => {
    // Environment filter
    if (
      selectedEnvironment !== "all" &&
      !v.environments.includes(selectedEnvironment)
    ) {
      return false;
    }
    // Tag filter (OR logic within selected tags)
    if (selectedTagIds.size > 0) {
      if (!v.tagIds || !v.tagIds.some((id) => selectedTagIds.has(id))) {
        return false;
      }
    }
    return true;
  });
  const showListLoading = isSearching ? isSearchLoading : isLoadingVariables;

  if (isLoading) {
    return <TerminalLoading fullPage />;
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="rounded-full p-3 bg-danger-soft">
          <svg
            className="h-6 w-6 text-danger"
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
      <PageHeader
        // The project's OWN icon and colour, not a generic folder glyph —
        // this square is how a project is recognised across the dashboard.
        leading={
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: project.color || DEFAULT_PROJECT_COLOR }}
          >
            <ProjectIcon icon={project.icon} size={20} />
          </div>
        }
        title={project.name}
        description={project.description || undefined}
        actions={
          <>
            <Link
              href={`/dashboard/projects/${project.slug}/members`}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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
            {canSeeTrash && (
              <Link
                href={`/dashboard/projects/${project.slug}/trash`}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Trash
              </Link>
            )}
          </>
        }
      />

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

      <div className="flex flex-wrap items-center gap-4">
        {/* A button group, not a form control, so it gets a labelled group
            rather than a <label htmlFor>. */}
        <span
          id="environment-filter-label"
          className="text-sm font-medium text-ink-muted"
        >
          Environment:
        </span>
        <div
          role="group"
          aria-labelledby="environment-filter-label"
          className="flex gap-2"
        >
          <button
            onClick={() => setSelectedEnvironment("all")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedEnvironment === "all"
                ? "bg-accent-soft text-accent ring-1 ring-accent-line"
                : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
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
                  ? "bg-accent-soft text-accent ring-1 ring-accent-line"
                  : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
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

      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <TerminalInput
          type="text"
          placeholder="Search this project's variables..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSearchTerm("");
          }}
          aria-label="Search variables"
          className="pl-10 pr-10"
        />
        {isSearchLoading ? (
          <svg
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-ink-subtle"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth={4}
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : searchTerm ? (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-muted"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between border-b px-6 py-4 border-line">
          <div>
            <h2 className="font-semibold text-ink">Environment Variables</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {filteredVariables.length}
              {isSearching ? " result" : " variable"}
              {filteredVariables.length !== 1 ? "s" : ""}
              {isSearching
                ? ` for "${trimmedSearch}"`
                : selectedEnvironment !== "all" && ` in ${selectedEnvironment}`}
            </p>
            {isSearching && searchData?.truncated && (
              <p className="mt-1 text-xs text-warning">
                Showing the first 100 matches — narrow your search to see more.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExportDrawer(true)}
              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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

            {canCreateVariable && (
              <button
                onClick={() => setShowImportDrawer(true)}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
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

            {(canCreateVariable || canRequestVariable) && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium transition-colors text-ink-inverse hover:bg-ink-muted"
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
                  {isMacPlatform ? "⌘⇧K" : "Ctrl+Shift+K"}
                </kbd>
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-line">
          {showListLoading ? (
            <TerminalLoading />
          ) : filteredVariables.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-raised">
                <svg
                  className="h-6 w-6 text-ink-muted"
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
              <h3 className="mt-4 text-sm font-semibold text-ink">
                {isSearching ? "No matching variables" : "No variables yet"}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {isSearching
                  ? `No variables match "${trimmedSearch}". Try a different term.`
                  : canCreateVariable
                    ? "Add your first environment variable to get started."
                    : "No variables available for this environment."}
              </p>
            </div>
          ) : (
            <>
              <AnimatedList className="divide-y divide-line">
                {filteredVariables.map((variable) => (
                  <VariableListItem
                    key={variable._id}
                    variable={{
                      ...variable,
                      tags: variable.tagIds?.flatMap((id) => {
                        const tag = tagsById.get(id);
                        return tag
                          ? [{ _id: tag._id, name: tag.name, color: tag.color }]
                          : [];
                      }),
                    }}
                    onEdit={() => setEditingVariable(variable)}
                    onDelete={() => setDeletingVariable(variable)}
                    onViewHistory={() => handleViewHistory(variable)}
                    onReveal={() => handleRevealValue(variable)}
                    revealedValue={revealedValues[variable._id] ?? null}
                    isRevealing={revealingIds.has(variable._id)}
                    canEdit={
                      canUpdateVariable || variable.permission === "write"
                    }
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
              {!isSearching &&
                (variablesStatus === "CanLoadMore" ||
                  variablesStatus === "LoadingMore") && (
                  <div className="flex justify-center border-t px-6 py-4 border-line">
                    <button
                      onClick={() => loadMoreVariables(50)}
                      disabled={variablesStatus === "LoadingMore"}
                      className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
                    >
                      {variablesStatus === "LoadingMore"
                        ? "Loading..."
                        : "Load more"}
                    </button>
                  </div>
                )}
            </>
          )}
        </div>

        {/* Pinned to the panel's bottom edge, inside its border. Renders null
            when nothing is running, and because it lives here rather than
            above the panel it never pushes the table down on appear or leave
            a gap on finish. The rows landing directly above it are the
            confirmation that the batch committed. */}
        <BulkJobStatusLine projectId={project._id} />
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
                if (!organization?.id || !convexUserId) return;
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
        message={`Are you sure you want to delete "${deletingVariable?.key}"? You can restore it for 7 days. After that it is permanently deleted, including the stored secret value.`}
        confirmText="Delete"
        variant="danger"
      />

      {projectId && (
        <ExportDialog
          isOpen={showExportDrawer}
          onClose={() => setShowExportDrawer(false)}
          projectId={projectId}
          projectName={project?.name || "project"}
          organizationId={orgId}
        />
      )}

      {projectId && (
        <ImportDialog
          isOpen={showImportDrawer}
          onClose={() => setShowImportDrawer(false)}
          projectId={projectId}
          organizationId={orgId}
        />
      )}

      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={handleBulkDelete}
        title="Bulk Delete Variables"
        message={`Are you sure you want to delete ${selectedIds.size} variable${selectedIds.size !== 1 ? "s" : ""}? You can restore them for 7 days. After that they are permanently deleted, including the stored secret values.`}
        confirmText={isBulkDeleting ? "Deleting..." : "Delete All"}
        variant="danger"
      />

      {isSelectionMode && selectedIds.size > 0 && (
        <FeatureGate
          organizationId={orgId}
          featureKey="bulk_delete"
          featureName="Bulk Delete"
          fallbackVariant="inline"
        >
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-5 py-3 shadow-2xl">
              <span className="text-sm font-medium text-ink-muted">
                {selectedIds.size} variable{selectedIds.size !== 1 ? "s" : ""}{" "}
                selected
              </span>
              <button
                onClick={() => selectAll(filteredVariables.map((v) => v._id))}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Select All
              </button>
              <button
                onClick={clearSelection}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
              >
                Clear
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={isBulkDeleting}
                className="rounded-lg bg-danger px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-danger disabled:opacity-50"
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
            canRollback={canDo("org:rollback_variable")}
            isLoading={isLoadingHistory}
            error={
              historyQueryError
                ? "Failed to load version history. Please try again."
                : null
            }
          />
        </FeatureGate>
      )}

      {sharingVariable && projectId && orgId && (
        <ShareSecretDrawer
          isOpen={!!sharingVariable}
          onClose={() => setSharingVariable(null)}
          variable={sharingVariable}
          organizationId={orgId}
          projectId={projectId}
          onRevealValue={async () => {
            if (!sharingVariable.vaultRef) return null;
            try {
              return await revealSecret(sharingVariable.vaultRef);
            } catch {
              return null;
            }
          }}
        />
      )}
    </div>
  );
}
