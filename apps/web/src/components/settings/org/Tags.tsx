"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListPlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { SettingsField, SettingsSection } from "@envpilot/ui";
import {
  TerminalButton,
  TerminalInput,
  TerminalLoading,
} from "@/components/dashboard/terminal-ui";
import { Pagination } from "@/components/dashboard/pagination";
import {
  useCreateTag,
  useDeleteTag,
  useOrganizationTags,
  usePagination,
  useUpdateTag,
  type Tag as TagType,
} from "@/hooks";
import { SWATCH_COLORS } from "@/constants/swatches";

/**
 * Stored tag colours are free-form hex. A tag saved before this ramp existed
 * must stay selectable, or opening the editor would silently rewrite it.
 */
function paletteFor(color: string): string[] {
  return SWATCH_COLORS.includes(color)
    ? SWATCH_COLORS
    : [color, ...SWATCH_COLORS];
}

function Swatch({
  color,
  selected,
  size,
  onSelect,
}: {
  color: string;
  selected: boolean;
  size: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Colour ${color}`}
      aria-pressed={selected}
      className={`${size} rounded-full border-2 transition-transform ${
        selected ? "scale-110 border-ink" : "border-transparent hover:scale-105"
      }`}
      style={{ backgroundColor: color }}
    />
  );
}

export function TagsTab({ organizationId }: { organizationId: string }) {
  const { tags, hasOverflow, isLoading } = useOrganizationTags(organizationId);
  const createTagMut = useCreateTag();
  const updateTagMut = useUpdateTag();
  const deleteTagMut = useDeleteTag();

  // UI state
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(SWATCH_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Bulk paste state
  const [bulkText, setBulkText] = useState("");
  const [bulkEntries, setBulkEntries] = useState<
    Array<{ name: string; color: string }>
  >([]);
  const [isBulkCreating, setIsBulkCreating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{
    total: number;
    completed: number;
    failures: Array<{ name: string; error: string }>;
  } | null>(null);

  // Notification state with auto-dismiss
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagSuccess, setTagSuccess] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showError = useCallback((msg: string) => {
    setTagError(msg);
    setTagSuccess(null);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setTagError(null), 5000);
  }, []);

  const showSuccess = useCallback((msg: string) => {
    setTagSuccess(msg);
    setTagError(null);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setTagSuccess(null), 3000);
  }, []);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Pagination (20 per page — tags are lightweight)
  const pagination = usePagination(tags, { pageSize: 20 });

  const extractErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error) return err.message;
    return fallback;
  };

  // Bulk paste parsing — accepts comma, semicolon, or newline separated names
  const parseBulkText = useCallback(
    (text: string) => {
      const names = text
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 50);

      // Deduplicate (case-insensitive) and remove names that already exist
      const existingNames = new Set(tags.map((t) => t.name.toLowerCase()));
      const seen = new Set<string>();
      const entries: Array<{ name: string; color: string }> = [];

      for (const name of names) {
        const lower = name.toLowerCase();
        if (seen.has(lower) || existingNames.has(lower)) continue;
        seen.add(lower);
        // Round-robin assign colors from the palette
        entries.push({
          name,
          color: SWATCH_COLORS[entries.length % SWATCH_COLORS.length],
        });
      }

      return entries;
    },
    [tags]
  );

  const handleBulkTextChange = useCallback(
    (text: string) => {
      setBulkText(text);
      setBulkEntries(parseBulkText(text));
    },
    [parseBulkText]
  );

  const removeBulkEntry = (name: string) => {
    setBulkEntries((prev) => prev.filter((e) => e.name !== name));
  };

  const handleBulkCreate = async () => {
    if (bulkEntries.length === 0) return;

    setIsBulkCreating(true);
    const progress = {
      total: bulkEntries.length,
      completed: 0,
      failures: [] as Array<{ name: string; error: string }>,
    };
    setBulkProgress(progress);

    for (const entry of bulkEntries) {
      try {
        await createTagMut.mutateAsync({
          organizationId,
          name: entry.name,
          color: entry.color,
        });
        progress.completed++;
      } catch (err) {
        progress.completed++;
        progress.failures.push({
          name: entry.name,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
      setBulkProgress({ ...progress });
    }

    setIsBulkCreating(false);
    setBulkProgress(null);

    const successCount = progress.total - progress.failures.length;
    if (progress.failures.length === 0) {
      showSuccess(
        `${successCount} tag${successCount !== 1 ? "s" : ""} created`
      );
      setBulkText("");
      setBulkEntries([]);
      setShowBulkPaste(false);
    } else if (successCount > 0) {
      showSuccess(
        `${successCount} created, ${progress.failures.length} failed`
      );
      // Keep the form open with only the failed entries visible
      setBulkEntries(
        bulkEntries.filter((e) =>
          progress.failures.some((f) => f.name === e.name)
        )
      );
    } else {
      showError("All tags failed to create. Check the errors below.");
    }
  };

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      showError("Tag name must be 50 characters or less");
      return;
    }
    try {
      await createTagMut.mutateAsync({
        organizationId,
        name: trimmed,
        color: newColor,
      });
      setNewName("");
      setNewColor(SWATCH_COLORS[0]);
      setShowCreate(false);
      showSuccess(`Tag "${trimmed}" created`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to create tag"));
    }
  };

  const handleUpdate = async (tagId: string) => {
    const trimmed = editName.trim();
    if (!trimmed) return;
    if (trimmed.length > 50) {
      showError("Tag name must be 50 characters or less");
      return;
    }
    try {
      await updateTagMut.mutateAsync({
        tagId,
        name: trimmed,
        color: editColor,
      });
      setEditingId(null);
      showSuccess(`Tag updated to "${trimmed}"`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to update tag"));
    }
  };

  const handleDelete = async (tagId: string) => {
    const tagName = tags.find((t) => t._id === tagId)?.name ?? "Tag";
    try {
      await deleteTagMut.mutateAsync({
        tagId,
      });
      setDeletingId(null);
      showSuccess(`Tag "${tagName}" deleted`);
    } catch (err) {
      showError(extractErrorMessage(err, "Failed to delete tag"));
    }
  };

  const startEdit = (tag: TagType) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  if (isLoading) {
    return <TerminalLoading />;
  }

  return (
    <SettingsSection
      title="Variable Tags"
      description={
        <>
          Create and manage tags to organize your environment variables.
          {tags.length > 0 && (
            <span className="ml-1 text-ink-faint">
              ({tags.length} tag{tags.length !== 1 ? "s" : ""})
            </span>
          )}
        </>
      }
    >
      {tagError && (
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-[12px] text-danger">{tagError}</p>
          <button
            onClick={() => setTagError(null)}
            className="shrink-0 text-xs text-danger/60 hover:text-danger"
          >
            Dismiss
          </button>
        </div>
      )}

      {tagSuccess && (
        <div className="flex items-start justify-between gap-4">
          <p className="font-mono text-[12px] text-accent">✓ {tagSuccess}</p>
          <button
            onClick={() => setTagSuccess(null)}
            className="shrink-0 text-xs text-accent/60 hover:text-accent"
          >
            Dismiss
          </button>
        </div>
      )}

      {hasOverflow && (
        <p className="font-mono text-[12px] text-warning">
          Showing the first 100 tags. Delete unused tags to reveal the remaining
          legacy tags.
        </p>
      )}

      {!showCreate && !showBulkPaste && (
        <div className="flex flex-wrap gap-2">
          <TerminalButton
            variant="secondary"
            onClick={() => {
              setShowBulkPaste(true);
              setShowCreate(false);
            }}
          >
            <ListPlus className="h-4 w-4" />
            Bulk add
          </TerminalButton>
          <TerminalButton
            onClick={() => {
              setShowCreate(true);
              setShowBulkPaste(false);
            }}
          >
            <Plus className="h-4 w-4" />
            New tag
          </TerminalButton>
        </div>
      )}

      {/* Bulk paste form */}
      {showBulkPaste && (
        <div className="space-y-4">
          <SettingsField
            label="Paste tag names"
            htmlFor="bulk-tag-names"
            hint="Separate with commas, semicolons, or newlines. Duplicates and existing tags are skipped."
          >
            <textarea
              id="bulk-tag-names"
              value={bulkText}
              onChange={(e) => handleBulkTextChange(e.target.value)}
              placeholder={`Database, AWS, API Keys\nFrontend, Backend, Auth\nCache; Storage; Monitoring`}
              rows={4}
              className="block w-full resize-none rounded-panel border border-line bg-surface px-3 py-2 font-mono text-sm text-ink placeholder-ink-faint transition-colors focus:border-accent-line focus:ring-1 focus:ring-accent-line focus:outline-none"
              disabled={isBulkCreating}
              autoFocus
            />
          </SettingsField>

          {bulkText.trim() && (
            <p className="text-xs text-ink-subtle">
              {bulkEntries.length} new tag
              {bulkEntries.length !== 1 ? "s" : ""} to create
              {bulkEntries.length === 0 &&
                bulkText.trim().length > 0 &&
                " (all names already exist or are duplicates)"}
            </p>
          )}

          {/* Preview with color dots and remove buttons */}
          {bulkEntries.length > 0 && (
            <div>
              <p className="font-mono text-[12px] text-ink-subtle">Preview</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {bulkEntries.map((entry) => (
                  <span
                    key={entry.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised py-0.5 pr-1 pl-2 text-xs text-ink"
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                    <button
                      type="button"
                      onClick={() => removeBulkEntry(entry.name)}
                      disabled={isBulkCreating}
                      className="rounded-full p-0.5 text-ink-subtle hover:bg-surface-hover hover:text-ink-muted disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {bulkProgress && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              <span className="text-sm text-ink-muted">
                Creating {bulkProgress.completed}/{bulkProgress.total}...
              </span>
              {bulkProgress.failures.length > 0 && (
                <span className="text-sm text-danger">
                  ({bulkProgress.failures.length} failed)
                </span>
              )}
            </div>
          )}

          {/* Bulk failure details */}
          {bulkProgress &&
            bulkProgress.failures.length > 0 &&
            !isBulkCreating && (
              <div>
                <p className="text-xs font-medium text-danger">Failed tags:</p>
                <ul className="mt-1 space-y-0.5">
                  {bulkProgress.failures.map((f) => (
                    <li key={f.name} className="text-xs text-danger/80">
                      {f.name}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

          <div className="flex flex-wrap justify-end gap-2">
            <TerminalButton
              variant="secondary"
              onClick={() => {
                setShowBulkPaste(false);
                setBulkText("");
                setBulkEntries([]);
                setBulkProgress(null);
              }}
              disabled={isBulkCreating}
            >
              Cancel
            </TerminalButton>
            <TerminalButton
              onClick={handleBulkCreate}
              disabled={bulkEntries.length === 0 || isBulkCreating}
            >
              {isBulkCreating
                ? `Creating ${bulkProgress?.completed ?? 0}/${bulkProgress?.total ?? 0}...`
                : `Create ${bulkEntries.length} tag${bulkEntries.length !== 1 ? "s" : ""}`}
            </TerminalButton>
          </div>
        </div>
      )}

      {/* Inline create form */}
      {showCreate && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <TerminalInput
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Tag name"
              maxLength={50}
              className="min-w-40 flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCreate();
                }
                if (e.key === "Escape") setShowCreate(false);
              }}
              autoFocus
            />
            <div className="flex flex-wrap gap-1">
              {paletteFor(newColor).map((color) => (
                <Swatch
                  key={color}
                  color={color}
                  selected={newColor === color}
                  size="h-6 w-6"
                  onSelect={() => setNewColor(color)}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <TerminalButton
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                setNewName("");
              }}
            >
              Cancel
            </TerminalButton>
            <TerminalButton
              onClick={handleCreate}
              disabled={!newName.trim() || createTagMut.isPending}
            >
              {createTagMut.isPending ? "Creating..." : "Create tag"}
            </TerminalButton>
          </div>
        </div>
      )}

      {/* Tags list */}
      <div>
        {tags.length === 0 ? (
          <p className="py-8 text-sm text-ink-subtle">
            No tags yet. Create your first tag to start organizing variables.
          </p>
        ) : (
          <>
            <div className="divide-y divide-line border-t border-line">
              {pagination.pageItems.map((tag) => (
                <div
                  key={tag._id}
                  data-testid="tag-row"
                  className="flex items-center gap-3 py-3"
                >
                  {editingId === tag._id ? (
                    <>
                      <div className="flex flex-1 flex-wrap items-center gap-3">
                        <TerminalInput
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={50}
                          className="min-w-40 flex-1"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleUpdate(tag._id);
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                        />
                        <div className="flex flex-wrap gap-1">
                          {paletteFor(editColor).map((color) => (
                            <Swatch
                              key={color}
                              color={color}
                              selected={editColor === color}
                              size="h-5 w-5"
                              onSelect={() => setEditColor(color)}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <TerminalButton
                          variant="secondary"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </TerminalButton>
                        <TerminalButton
                          onClick={() => handleUpdate(tag._id)}
                          disabled={!editName.trim() || updateTagMut.isPending}
                        >
                          {updateTagMut.isPending ? "Saving..." : "Save"}
                        </TerminalButton>
                      </div>
                    </>
                  ) : deletingId === tag._id ? (
                    <>
                      <div className="flex-1">
                        <p className="text-sm text-danger">
                          Delete &ldquo;{tag.name}&rdquo;? This will remove it
                          from all variables.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <TerminalButton
                          variant="secondary"
                          onClick={() => setDeletingId(null)}
                        >
                          Cancel
                        </TerminalButton>
                        <TerminalButton
                          variant="danger"
                          onClick={() => handleDelete(tag._id)}
                          disabled={deleteTagMut.isPending}
                        >
                          {deleteTagMut.isPending ? "Deleting..." : "Delete"}
                        </TerminalButton>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-ink">
                          {tag.name}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(tag)}
                          className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-accent"
                          title="Edit tag"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeletingId(tag._id)}
                          className="rounded-panel p-1.5 text-ink-subtle hover:bg-surface-hover hover:text-danger"
                          title="Delete tag"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {pagination.totalPages > 1 && (
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                hasNextPage={pagination.hasNextPage}
                hasPrevPage={pagination.hasPrevPage}
                onNextPage={pagination.nextPage}
                onPrevPage={pagination.prevPage}
                onGoToPage={pagination.goToPage}
                startIndex={pagination.startIndex}
                endIndex={pagination.endIndex}
                totalItems={pagination.totalItems}
              />
            )}
          </>
        )}
      </div>
    </SettingsSection>
  );
}
