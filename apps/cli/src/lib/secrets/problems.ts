/**
 * Problems a secret resolve can surface.
 *
 * The point of this module is that a problem is a VALUE, not a console
 * warning. `run` used to print a yellow line and spawn the command anyway,
 * so a half-populated environment reached the app and failed later somewhere
 * unrelated. Returning problems lets every caller decide, and lets `doctor`
 * report the same conditions `run` refuses to start on.
 */

/** Keys that live in the project but not in the environment being loaded. */
export interface ForeignKey {
  key: string;
  environments: string[];
}

export type Problem =
  /** Vault decryption failed; these keys are absent from the resolved set. */
  | { kind: "decrypt-failed"; keys: string[] }
  /** The server capped its read, so the set is short by an unknown amount. */
  | { kind: "truncated"; limit: number }
  /** Required keys that no source supplied. */
  | { kind: "missing-required"; keys: string[] }
  /** The caller's role narrowed the set. Advisory: may well be intended. */
  | { kind: "scope-restricted" }
  /** Accessible keys that exist only in other environments. Advisory. */
  | { kind: "other-environments"; keys: ForeignKey[] };

/**
 * Whether a problem means the resolved set cannot be trusted to boot an app.
 *
 * Advisory problems describe a set that is complete for what was asked;
 * blocking problems describe a set that is silently short. Only the latter
 * stops a spawn.
 */
export function isBlocking(problem: Problem): boolean {
  switch (problem.kind) {
    case "decrypt-failed":
    case "truncated":
    case "missing-required":
      return true;
    case "scope-restricted":
    case "other-environments":
      return false;
  }
}

/** One line a human can act on. */
export function describeProblem(problem: Problem): string {
  switch (problem.kind) {
    case "decrypt-failed":
      return `${problem.keys.length} ${plural(problem.keys.length, "variable")} could not be decrypted and ${problem.keys.length === 1 ? "was" : "were"} not injected: ${list(problem.keys)}`;
    case "truncated":
      return `The server returned a capped result (limit ${problem.limit}). Some variables are missing from this set.`;
    case "missing-required":
      return `${problem.keys.length} required ${plural(problem.keys.length, "variable")} missing: ${list(problem.keys)}`;
    case "scope-restricted":
      return "Your role restricts which variables you can see, so some may be withheld.";
    case "other-environments":
      return `${problem.keys.length} ${plural(problem.keys.length, "variable")} not in this environment: ${list(problem.keys.map((k) => k.key))}`;
  }
}

/**
 * Required keys that nothing supplied.
 *
 * Checked against the COMPOSED environment rather than the fetched set, so a
 * value already exported in the caller's shell counts as satisfied. Returns
 * null when nothing is missing so callers can `if (problem)` without
 * inspecting an array length.
 */
export function checkRequired(
  composed: NodeJS.ProcessEnv,
  required: readonly string[]
): Extract<Problem, { kind: "missing-required" }> | null {
  const missing = required.filter((key) => {
    const value = composed[key];
    return value === undefined || value === "";
  });
  return missing.length > 0
    ? { kind: "missing-required", keys: missing }
    : null;
}

/** Parse comma-joined and/or repeated flag values into unique, trimmed keys. */
export function parseKeyList(raw: string[] | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .flatMap((entry) => entry.split(","))
        .map((key) => key.trim())
        .filter(Boolean)
    ),
  ];
}

const MAX_LISTED = 5;

function list(keys: readonly string[]): string {
  const shown = keys.slice(0, MAX_LISTED).join(", ");
  const rest = keys.length - MAX_LISTED;
  return rest > 0 ? `${shown}, +${rest} more` : shown;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
