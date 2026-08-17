"use client";

import { Tag } from "lucide-react";

interface TagBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md";
  onRemove?: () => void;
}

export function TagBadge({
  name,
  color: rawColor,
  size = "sm",
  onRemove,
}: TagBadgeProps) {
  const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor : "#6b7280";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
      style={{
        backgroundColor: `${color}15`,
        borderColor: `${color}40`,
        color: color,
      }}
    >
      <Tag className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {name}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${name}`}
          className="ml-0.5 rounded-full p-0.5 transition-colors hover:bg-white/10"
        >
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor">
            <path d="M7.354 2.646a.5.5 0 010 .708L5.707 5l1.647 1.646a.5.5 0 01-.708.708L5 5.707 3.354 7.354a.5.5 0 01-.708-.708L4.293 5 2.646 3.354a.5.5 0 01.708-.708L5 4.293l1.646-1.647a.5.5 0 01.708 0z" />
          </svg>
        </button>
      )}
    </span>
  );
}
