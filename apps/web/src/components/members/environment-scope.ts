import { ENVIRONMENTS } from "@/constants/project";

// Pure scope helpers, kept out of the component module so that file
// exports only its component and Fast Refresh has a boundary it can
// preserve state across.

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
