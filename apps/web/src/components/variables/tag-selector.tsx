"use client";

import { useState } from "react";
import { Tag, Plus, Check } from "lucide-react";
import type { Tag as TagType } from "@/hooks/queries";
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
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
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
          return (
            <button
              key={tag._id}
              type="button"
              onClick={() => toggleTag(tag._id)}
              disabled={disabled}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "ring-1 ring-offset-1 dark:ring-offset-zinc-900"
                  : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
              style={
                isSelected
                  ? {
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                      boxShadow: `0 0 0 1px ${tag.color}`,
                    }
                  : {
                      backgroundColor: "transparent",
                      border: "1px solid var(--color-zinc-200)",
                      color: "var(--color-zinc-500)",
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
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
          >
            <Plus className="h-3 w-3" />
            New tag
          </button>
        )}
      </div>

      {/* Inline create form */}
      {showCreate && onCreateTag && (
        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/50">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            maxLength={50}
            className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreate();
              }
              if (e.key === "Escape") setShowCreate(false);
            }}
            autoFocus
          />
          <div className="flex gap-1">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewTagColor(color)}
                className={`h-5 w-5 rounded-full border-2 transition-transform ${
                  newTagColor === color
                    ? "scale-110 border-zinc-900 dark:border-white"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newTagName.trim() || isCreating}
            className="rounded-lg bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {isCreating ? "..." : "Add"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg px-2 py-1 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
