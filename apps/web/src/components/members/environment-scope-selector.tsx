"use client";

import { ENVIRONMENTS } from "@/constants/project";

/** All environments checked — the default, meaning unrestricted access. */
export function allEnvironments(): string[] {
  return [...ENVIRONMENTS];
}

export function isUnrestrictedScope(selected: string[]): boolean {
  return ENVIRONMENTS.every((env) => selected.includes(env));
}

/**
 * Convert the UI selection to the API payload. All environments checked means
 * unrestricted — send nothing so the backend stores no scope.
 */
export function scopeToPayload(selected: string[]): string[] | undefined {
  return isUnrestrictedScope(selected) ? undefined : selected;
}

/** Human-readable scope for badges: "development, staging" or "All environments". */
export function formatEnvironmentScope(environments?: string[] | null): string {
  // Absent scope = unrestricted; an explicit empty array = deny-all (backend
  // rejects it on write, but a legacy row could carry it — show the truth).
  if (environments == null) return "All environments";
  if (environments.length === 0) return "No environments";
  const known = ENVIRONMENTS.filter((env) => environments.includes(env));
  const extras = environments.filter(
    (env) => !(ENVIRONMENTS as readonly string[]).includes(env)
  );
  return [...known, ...extras].join(", ");
}

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
  function toggle(env: string, checked: boolean) {
    if (checked) {
      onChange([...selected, env]);
    } else {
      onChange(selected.filter((e) => e !== env));
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
        Environment access
      </label>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {helperText} A variable is visible only when all of its environments
        fall within this scope.
      </p>
      <div className="mt-2 space-y-1 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
        {ENVIRONMENTS.map((env) => (
          <label
            key={env}
            className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${
              disabled
                ? "cursor-not-allowed opacity-50"
                : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800"
            }`}
          >
            <input
              type="checkbox"
              checked={selected.includes(env)}
              disabled={disabled}
              onChange={(e) => toggle(env, e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm capitalize text-zinc-900 dark:text-zinc-100">
              {env}
            </span>
          </label>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
          Select at least one environment, or check all for unrestricted access.
        </p>
      )}
    </div>
  );
}
