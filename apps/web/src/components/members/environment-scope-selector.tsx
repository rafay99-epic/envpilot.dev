"use client";

import { useId } from "react";

import { ENVIRONMENTS } from "@/constants/project";
import { allEnvironments, isUnrestrictedScope } from "./environment-scope";

interface EnvironmentScopeSelectorProps {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** Override the default helper copy. */
  helperText?: string;
}

/**
 * Checkbox list for a developer's environment scope. Default is all checked
 * (unrestricted). Semantics are subset-based: a variable is visible only if
 * ALL of its environments fall within the selected scope.
 */
export function EnvironmentScopeSelector({
  selected,
  onChange,
  disabled = false,
  helperText = "Developers only see and edit variables in the selected environments. Production access can be withheld here.",
}: EnvironmentScopeSelectorProps) {
  const uid = useId();
  const labelId = `${uid}-label`;
  const helpId = `${uid}-help`;

  function toggle(env: string, checked: boolean) {
    if (checked) {
      onChange([...selected, env]);
    } else {
      onChange(selected.filter((e) => e !== env));
    }
  }

  return (
    <div>
      <div id={labelId} className="block text-sm font-medium text-ink">
        Environment access
      </div>
      <p id={helpId} className="mt-1 text-xs text-ink-muted">
        {helperText} A variable is visible only when all of its environments
        fall within this scope.
      </p>
      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={helpId}
        className="mt-2 space-y-1 rounded-lg border p-2 border-line"
      >
        {ENVIRONMENTS.map((env) => (
          <label
            key={env}
            className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-surface-hover"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(env)}
              disabled={disabled}
              onChange={(e) => toggle(env, e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm capitalize text-ink">{env}</span>
          </label>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="mt-1.5 text-xs text-warning">
          Select at least one environment, or check all for unrestricted access.
        </p>
      )}
    </div>
  );
}
