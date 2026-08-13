"use client";

import { useState } from "react";
import { Tag, Plus, Check } from "lucide-react";
import type { Tag as TagType } from "@/hooks/useTags";
import { TagBadge } from "./tag-badge";

const TAG_COLORS = [
  "#3b82f6",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#6366f1",
  "#84cc16",
];

interface TagSelectorProps {
  availableTags: TagType[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  onCreateTag?: (name: string, color: string) => Promise<void>;
  disabled?: boolean;
}

export function TagSelector({
  availableTags,
  selectedTagIds,
  onChange,
  onCreateTag,
  disabled = false,
}: TagSelectorProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  const toggleTag = (tagId: string) => {
    if (disabled) return;
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  };

  const handleCreate = async () => {
    if (!newTagName.trim() || !onCreateTag) return;
    setIsCreating(true);
    try {
      await onCreateTag(newTagName.trim(), newTagColor);
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0]);
      setShowCreate(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-ink-muted">
        <span className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5" />
          Tags
        </span>
      </label>

      {/* Selected tags display */}
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTagIds.map((tagId) => {
            const tag = availableTags.find((t) => t._id === tagId);
            if (!tag) return null;
            return (
              <TagBadge
                key={tagId}
                name={tag.name}
                color={tag.color}
                size="md"
                onRemove={() => toggleTag(tagId)}
              />
            );
          })}
        </div>
      )}

      {/* Tag toggle chips */}
      <div className="flex flex-wrap gap-1.5">
        {availableTags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag._id);
          const safeColor = /^#[0-9a-fA-F]{6}$/.test(tag.color)
            ? tag.color
            : "#6b7280";
          return (
            <button
              key={tag._id}
              type="button"
              onClick={() => toggleTag(tag._id)}
              disabled={disabled}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "ring-1 ring-offset-1 ring-offset-line"
                  : "hover:bg-surface-hover"
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: `${safeColor}20`,
                      color: safeColor,
                      boxShadow: `0 0 0 1px ${safeColor}`,
                    }
                  : {
                      backgroundColor: "transparent",
                      border: "1px solid var(--color-line)",
                      color: "var(--color-ink-subtle)",
                    }
              }
            >
              {isSelected ? (
                <Check className="h-3 w-3" />
              ) : (
                <Tag className="h-3 w-3" />
              )}
              {tag.name}
            </button>
          );
        })}

        {/* Create new tag button */}
        {onCreateTag && !showCreate && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-lg border border-dashed px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 border-line-strong text-ink-muted hover:border-line-strong hover:text-ink-muted"
          >
            <Plus className="h-3 w-3" />
            New tag
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showCreate && onCreateTag && (
        <div className="space-y-3 rounded-lg border p-3 border-line bg-surface-raised/50">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            maxLength={50}
            className="w-full rounded border px-2.5 py-1.5 text-sm focus:border-line-strong focus:outline-none border-line-strong bg-surface-raised text-ink placeholder-ink-subtle"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") setShowCreate(false);
            }}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewTagColor(color)}
                className={`h-6 w-6 rounded-full border-2 transition-transform ${
                  newTagColor === color
                    ? "scale-110 border-white"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-subtle hover:text-ink-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!newTagName.trim() || isCreating}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 bg-ink text-ink-inverse hover:bg-ink-muted"
            >
              {isCreating ? "Creating..." : "Add Tag"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
