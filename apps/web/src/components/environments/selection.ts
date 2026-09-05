import { ENVIRONMENTS, type Environment } from "@/constants/project";

// Pure helpers behind the environment picker. Kept out of the component
// module so the forms can compute a submit label without importing JSX, and
// so Fast Refresh keeps a boundary it can preserve state across.

const KNOWN: ReadonlySet<string> = new Set(ENVIRONMENTS);

function isEnvironment(value: string): value is Environment {
  return KNOWN.has(value);
}

export interface EnvironmentSelection {
  /** Buttons to render, in order: the writable set, then the locked ones. */
  options: Environment[];
  /** Options the caller may not toggle. */
  locked: ReadonlySet<Environment>;
  /** What to submit: always inside `options`, always including `locked`. */
  selected: Environment[];
}

/**
 * What an environment picker offers and what its form submits.
 *
 * Derived on every render rather than seeded once, because `allowed` arrives
 * asynchronously (useProtection resolves after mount): a scope that narrows
 * later would otherwise leave a hidden, unwritable environment in the
 * submitted set. Stored environments outside the caller's scope stay
 * selected but locked — an unrelated edit must never unassign a resource
 * from an environment the member cannot write to.
 */
export function resolveEnvironments(
  draft: readonly string[],
  allowed: readonly string[],
  stored?: readonly string[]
): EnvironmentSelection {
  const allowedSet = new Set(allowed);
  const locked = new Set<Environment>();
  for (const env of stored ?? []) {
    if (isEnvironment(env) && !allowedSet.has(env)) locked.add(env);
  }
  const options: Environment[] = [...allowed.filter(isEnvironment), ...locked];
  const draftSet = new Set(draft);
  const selected = options.filter(
    (env) => locked.has(env) || draftSet.has(env)
  );
  return { options, locked, selected };
}

export interface ProtectionState {
  /** Protected environments this save touches, in the project's own order. */
  protectedSelected: string[];
  /** True when the save is filed as a change request, not a direct write. */
  proposing: boolean;
}

/**
 * The server checks the union of a resource's stored environments and the
 * proposed ones, so removing a protected environment is still a proposal —
 * pass `existing` on every edit path or the UI promises a direct write the
 * server turns into a request.
 */
export function protectionState(
  selected: readonly string[],
  existing: readonly string[] | undefined,
  protectedEnvironments: readonly string[] | undefined
): ProtectionState {
  if (!protectedEnvironments?.length) {
    return { protectedSelected: [], proposing: false };
  }
  const touched = new Set([...(existing ?? []), ...selected]);
  const protectedSelected = protectedEnvironments.filter((env) =>
    touched.has(env)
  );
  return { protectedSelected, proposing: protectedSelected.length > 0 };
}

/**
 * A row spanning a protected and an unprotected environment is invisible to
 * anyone scoped to the unprotected one. Judged on what the save keeps, not
 * on the touched union.
 */
export function spansProtection(
  selected: readonly string[],
  protectedEnvironments: readonly string[] | undefined
): boolean {
  if (!protectedEnvironments?.length) return false;
  const protectedSet = new Set(protectedEnvironments);
  const count = selected.filter((env) => protectedSet.has(env)).length;
  return count > 0 && count < selected.length;
}
