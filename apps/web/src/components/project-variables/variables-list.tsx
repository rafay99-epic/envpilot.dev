"use client";

import type { PaginationStatus } from "convex/react";
import { TerminalLoading } from "@/components/dashboard/terminal-ui";
import { AnimatedList } from "@/components/dashboard/animated-list";
import { VariableListItem } from "@/components/variables";
import { DuplicateBadge } from "@/components/workspaces";
import type { Tag, useDuplicateKeys } from "@/hooks";
import { VariablesEmptyState } from "./variables-empty-state";
import type { Variable, VariableCapabilities } from "./types";

// The variable rows themselves, with their loading, empty and load-more states.
export function VariablesList({
  variables,
  tagsById,
  duplicateKeys,
  selectedIds,
  revealedValues,
  revealingIds,
  isLoading,
  isSearching,
  searchTerm,
  status,
  onLoadMore,
  capabilities,
  onEdit,
  onDelete,
  onViewHistory,
  onReveal,
  onShare,
  onShareAcross,
  onToggleSelect,
}: {
  variables: Variable[];
  tagsById: Map<string, Tag>;
  duplicateKeys: ReturnType<typeof useDuplicateKeys>;
  selectedIds: Set<string>;
  revealedValues: Record<string, string>;
  revealingIds: Set<string>;
  isLoading: boolean;
  isSearching: boolean;
  searchTerm: string;
  status: PaginationStatus;
  onLoadMore: (numItems: number) => void;
  capabilities: VariableCapabilities;
  onEdit: (variable: Variable) => void;
  onDelete: (variable: Variable) => void;
  onViewHistory: (variable: Variable) => void;
  onReveal: (variable: Variable) => void;
  onShare: (variable: Variable) => void;
  onShareAcross: (variable: Variable) => void;
  onToggleSelect: (variableId: string) => void;
}) {
  const {
    canCreateVariable,
    canUpdateVariable,
    canDeleteVariable,
    canShare,
    canManageShares,
  } = capabilities;

  return (
    <div className="divide-y divide-line">
      {isLoading ? (
        <TerminalLoading />
      ) : variables.length === 0 ? (
        <VariablesEmptyState
          isSearching={isSearching}
          searchTerm={searchTerm}
          canCreateVariable={canCreateVariable}
        />
      ) : (
        <>
          <AnimatedList className="divide-y divide-line">
            {variables.map((variable) => (
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
                onEdit={() => onEdit(variable)}
                onDelete={() => onDelete(variable)}
                onViewHistory={() => onViewHistory(variable)}
                onReveal={() => onReveal(variable)}
                revealedValue={revealedValues[variable._id] ?? null}
                isRevealing={revealingIds.has(variable._id)}
                canEdit={canUpdateVariable || variable.permission === "write"}
                canDelete={canDeleteVariable}
                permissionLevel={variable.permission ?? null}
                onShare={canShare ? () => onShare(variable) : undefined}
                badge={
                  <DuplicateBadge
                    others={duplicateKeys.get(variable.key)?.others}
                    verified={duplicateKeys.get(variable.key)?.verified}
                  />
                }
                onShareAcross={
                  canManageShares ? () => onShareAcross(variable) : undefined
                }
                showCheckbox={canDeleteVariable}
                isSelected={selectedIds.has(variable._id)}
                onToggleSelect={() => onToggleSelect(variable._id)}
              />
            ))}
          </AnimatedList>
          {!isSearching &&
            (status === "CanLoadMore" || status === "LoadingMore") && (
              <div className="flex justify-center border-t px-6 py-4 border-line">
                <button
                  onClick={() => onLoadMore(50)}
                  disabled={status === "LoadingMore"}
                  className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 border-line bg-surface-raised text-ink-muted hover:bg-surface-hover"
                >
                  {status === "LoadingMore" ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
        </>
      )}
    </div>
  );
}
