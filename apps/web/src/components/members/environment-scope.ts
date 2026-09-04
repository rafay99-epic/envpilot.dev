import { ENVIRONMENTS } from "@/constants/project";

// Pure scope helpers, kept out of the component module so that file
// exports only its component and Fast Refresh has a boundary it can
// preserve state across.

/** All environments checked — the default, meaning unrestricted access. */
export function allEnvironments(): string[] {
  return [...ENVIRONMENTS];
}

/**
 * Whether `selected` covers every environment available to the member —
 * every environment when the role default is unrestricted, or every
 * environment in the role's ceiling otherwise.
 */
export function isUnrestrictedScope(
  selected: string[],
  ceiling?: string[]
): boolean {
  const universe = ceiling ?? ENVIRONMENTS;
  return universe.every((env) => selected.includes(env));
}

/**
 * Convert the UI selection to the API payload. Covering the full ceiling
 * (or all environments, when unrestricted) means unrestricted-within-role —
 * send nothing so the assignment always inherits the role's current default.
 */
export function scopeToPayload(
  selected: string[],
  ceiling?: string[]
): string[] | undefined {
  return isUnrestrictedScope(selected, ceiling) ? undefined : selected;
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
