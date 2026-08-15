"use client";

import { Tag } from "lucide-react";
import type { Tag as TagType } from "@/hooks/useTags";

interface TagFilterProps {
  tags: TagType[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  onClearAll: () => void;
}

export function TagFilter({
  tags,
  selectedTagIds,
  onToggleTag,
  onClearAll,
}: TagFilterProps) {
  if (tags.length === 0) return null;

  const hasSelection = selectedTagIds.length > 0;
  // Built once, probed O(1) per chip: both lists grow with the tag registry.
  const selectedIds = new Set(selectedTagIds);

  return (
    <>
      <span className="mx-2 text-ink-faint">|</span>
      <label className="text-sm font-medium text-ink-muted">Tags:</label>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={onClearAll}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            !hasSelection
              ? "bg-accent-soft text-accent ring-1 ring-accent-line"
              : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
          }`}
        >
          All
        </button>
        {tags.map((tag) => {
          const isSelected = selectedIds.has(tag._id);
          const safeColor = /^#[0-9a-fA-F]{6}$/.test(tag.color)
            ? tag.color
            : "#6b7280";
          return (
            <button
              key={tag._id}
              onClick={() => onToggleTag(tag._id)}
              aria-pressed={isSelected}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                isSelected
                  ? ""
                  : "bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
              // Selected tags carry the tag's own colour as a soft tint, the
              // same treatment TagBadge and the tag selector already use.
              style={
                isSelected
                  ? {
                      backgroundColor: `${safeColor}15`,
                      boxShadow: `inset 0 0 0 1px ${safeColor}40`,
                      color: safeColor,
                    }
                  : undefined
              }
            >
              <Tag className="h-3 w-3" />
              {tag.name}
            </button>
          );
        })}
      </div>
    </>
  );
}
