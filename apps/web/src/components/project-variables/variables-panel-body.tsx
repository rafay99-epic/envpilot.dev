"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { PaginationStatus } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { SharedBlock } from "@/components/workspaces";
import { useDuplicateKeys, type SharedRow, type Tag } from "@/hooks";
import { useRevealSecret } from "@/hooks/useRevealSecret";
import { useVariableSelectionStore } from "@/stores/variable-selection-store";
import { createLogger } from "@/lib/logger";
import { VariablesList } from "./variables-list";
import type { Variable, VariableCapabilities } from "./types";

const log = createLogger("app/dashboard/project-detail");

// Rows shared into this project, then the project's own variables. Owns the
// reveal cache both halves read from.
export function VariablesPanelBody({
  projectId,
  projectName,
  organizationId,
  variables,
  tags,
  isLoading,
  isSearching,
  searchTerm,
  status,
  onLoadMore,
  capabilities,
  onEdit,
  onDelete,
  onViewHistory,
  onShare,
  onShareAcross,
  onEditShared,
  onDeleteShared,
}: {
  projectId: Id<"projects"> | undefined;
  projectName: string;
  organizationId: Id<"organizations"> | undefined;
  variables: Variable[];
  tags: Tag[];
  isLoading: boolean;
  isSearching: boolean;
  searchTerm: string;
  status: PaginationStatus;
  onLoadMore: (numItems: number) => void;
  capabilities: VariableCapabilities;
  onEdit: (variable: Variable) => void;
  onDelete: (variable: Variable) => void;
  onViewHistory: (variable: Variable) => void;
  onShare: (variable: Variable) => void;
  onShareAcross: (variable: Variable) => void;
  onEditShared: (row: SharedRow) => void;
  onDeleteShared: (row: SharedRow) => void;
}) {
  const { canManageShares } = capabilities;
  const { selectedIds, toggleSelect } = useVariableSelectionStore();
  const revealSecret = useRevealSecret();
  const duplicateKeys = useDuplicateKeys(
    canManageShares ? projectId : undefined
  );

  const [revealedValues, setRevealedValues] = useState<Record<string, string>>(
    {}
  );
  const [revealingIds, setRevealingIds] = useState<Set<string>>(new Set());

  // Built once instead of scanning the tag list per tag per rendered row.
  const tagsById = new Map(tags.map((tag) => [tag._id, tag]));

  const handleRevealValue = async (variable: {
    _id: string;
    vaultRef?: string;
  }) => {
    if (revealedValues[variable._id]) return;
    if (!variable.vaultRef || !organizationId) return;

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
          organizationId,
          vaultRef: variable.vaultRef,
        },
        err
      );
      toast.error("Failed to reveal variable value.");
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

  return (
    <>
      <SharedBlock
        projectId={projectId}
        projectName={projectName}
        canManage={canManageShares}
        revealedValues={revealedValues}
        revealingIds={revealingIds}
        onReveal={handleRevealValue}
        onEdit={onEditShared}
        onDelete={onDeleteShared}
      />

      <VariablesList
        variables={variables}
        tagsById={tagsById}
        duplicateKeys={duplicateKeys}
        selectedIds={selectedIds}
        revealedValues={revealedValues}
        revealingIds={revealingIds}
        isLoading={isLoading}
        isSearching={isSearching}
        searchTerm={searchTerm}
        status={status}
        onLoadMore={onLoadMore}
        capabilities={capabilities}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewHistory={onViewHistory}
        onReveal={handleRevealValue}
        onShare={onShare}
        onShareAcross={onShareAcross}
        onToggleSelect={toggleSelect}
      />
    </>
  );
}
