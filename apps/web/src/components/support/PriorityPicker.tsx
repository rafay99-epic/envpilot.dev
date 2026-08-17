"use client";

import { terminal } from "@/components/marketing";
import { CHOICE_CLASSES } from "./choice-classes";

export type Priority = "low" | "medium" | "high";

const PRIORITIES: { value: Priority; label: string; dot: string }[] = [
  { value: "low", label: "Low", dot: "bg-surface-hover" },
  { value: "medium", label: "Medium", dot: "bg-warning" },
  { value: "high", label: "High", dot: "bg-danger" },
];

// The label names the whole button group, so it is a span + role="group"
// rather than a <label>, which may only name a single control.
export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (value: Priority) => void;
}) {
  return (
    <div>
      <span
        id="support-priority-label"
        className={`mb-1.5 block ${terminal.label}`}
      >
        <span className="mr-1.5 text-accent">❯</span> priority
      </span>
      <div
        role="group"
        aria-labelledby="support-priority-label"
        className="grid grid-cols-3 gap-2"
      >
        {PRIORITIES.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => onChange(p.value)}
            aria-pressed={value === p.value}
            className={`${CHOICE_CLASSES(value === p.value)} justify-center`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
