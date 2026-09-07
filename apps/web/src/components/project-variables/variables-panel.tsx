"use client";

import { useState, useEffect } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { BulkJobStatusLine } from "@/components/variables/BulkJobStatusLine";
import type { SharedRow, Tag } from "@/hooks";
import { BulkActionBar } from "./bulk-action-bar";
import { VariablesPanelBody } from "./variables-panel-body";
import { VariablesPanelHeader } from "./variables-panel-header";
import { VariablesSearchInput } from "./variables-search-input";
import type { Variable, VariableCapabilities } from "./types";

// Search box, the variables panel itself, and the multi-select bar. Owns the
// list source (paginated query or server search) and the client-side filters.
export function VariablesPanel({
  projectId,
  projectName,
  organizationId,
  convexUserId,
  tags,
  selectedEnvironment,
  selectedTags,
  capabilities,
  onCreate,
  onExport,
  onImport,
  onEditVariable,
  onDeleteVariable,
  onViewHistory,
  onShareVariable,
  onShareAcross,
  onEditShared,
  onDeleteShared,
}: {
  projectId: Id<"projects"> | undefined;
  projectName: string;
  organizationId: Id<"organizations"> | undefined;
  convexUserId: Id<"users"> | undefined;
  tags: Tag[];
  selectedEnvironment: string;
  selectedTags: string[];
  capabilities: VariableCapabilities;
  onCreate: () => void;
  onExport: () => void;
  onImport: () => void;
  onEditVariable: (variable: Variable) => void;
  onDeleteVariable: (variable: Variable) => void;
  onViewHistory: (variable: Variable) => void;
  onShareVariable: (variable: Variable) => void;
  onShareAcross: (variable: Variable) => void;
  onEditShared: (row: SharedRow) => void;
  onDeleteShared: (row: SharedRow) => void;
}) {
  const { canCreateVariable, canAddVariable } = capabilities;

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

  // Search mode swaps the source to server results (already env-filtered by
  // the `environment` arg); the paginated list keeps client-side env filtering.
  // Tag filtering stays client-side in both modes.
  const baseVariables = isSearching
    ? ((searchData?.results ?? []) as Variable[])
    : variables;
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

  return (
    <>
      <VariablesSearchInput
        value={searchTerm}
        onChange={setSearchTerm}
        isLoading={isSearchLoading}
      />

      <div className="rounded-xl border border-line bg-surface">
        <VariablesPanelHeader
          count={filteredVariables.length}
          isSearching={isSearching}
          searchTerm={trimmedSearch}
          truncated={searchData?.truncated}
          selectedEnvironment={selectedEnvironment}
          canCreateVariable={canCreateVariable}
          canAddVariable={canAddVariable}
          onExport={onExport}
          onImport={onImport}
          onCreate={onCreate}
        />

        <VariablesPanelBody
          projectId={projectId}
          projectName={projectName}
          organizationId={organizationId}
          variables={filteredVariables}
          tags={tags}
          isLoading={showListLoading}
          isSearching={isSearching}
          searchTerm={trimmedSearch}
          status={variablesStatus}
          onLoadMore={loadMoreVariables}
          capabilities={capabilities}
          onEdit={onEditVariable}
          onDelete={onDeleteVariable}
          onViewHistory={onViewHistory}
          onShare={onShareVariable}
          onShareAcross={onShareAcross}
          onEditShared={onEditShared}
          onDeleteShared={onDeleteShared}
        />

        {/* Pinned to the panel's bottom edge, inside its border. Renders null
            when nothing is running, and because it lives here rather than
            above the panel it never pushes the table down on appear or leave
            a gap on finish. The rows landing directly above it are the
            confirmation that the batch committed. */}
        <BulkJobStatusLine projectId={projectId} />
      </div>

      <BulkActionBar
        projectId={projectId}
        organizationId={organizationId}
        visibleVariableIds={filteredVariables.map((v) => v._id)}
      />
    </>
  );
}
