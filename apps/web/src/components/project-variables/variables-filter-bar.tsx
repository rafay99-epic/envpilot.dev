"use client";

import type { Dispatch, SetStateAction } from "react";
import { TagFilter } from "@/components/variables";
import { ENVIRONMENTS } from "@/constants/project";
import type { Tag } from "@/hooks";

// Environment tab group plus the optional tag filter above the list.
export function VariablesFilterBar({
  selectedEnvironment,
  onSelectEnvironment,
  showTags,
  tags,
  selectedTags,
  setSelectedTags,
}: {
  selectedEnvironment: string;
  onSelectEnvironment: (environment: string) => void;
  showTags: boolean;
  tags: Tag[];
  selectedTags: string[];
  setSelectedTags: Dispatch<SetStateAction<string[]>>;
}) {
  return (
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
          onClick={() => onSelectEnvironment("all")}
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
            onClick={() => onSelectEnvironment(env)}
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
      {showTags && tags.length > 0 && (
        <TagFilter
          tags={tags}
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
  );
}
