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

  return (
    <>
      <span className="mx-2 text-zinc-300 dark:text-zinc-600">|</span>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Tags:
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={onClearAll}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            !hasSelection
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          }`}
        >
          All
        </button>
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag._id);
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
                  ? "text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              }`}
              style={isSelected ? { backgroundColor: safeColor } : undefined}
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
