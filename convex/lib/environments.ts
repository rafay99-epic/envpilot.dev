/**
 * The platform's environment names.
 *
 * This triple is copy-pasted across the codebase, which is how the MCP write
 * path ended up with no server-side check at all. This module is where it
 * belongs, and the read surfaces now import it.
 *
 * NOT yet migrated, deliberately, to keep this change reviewable:
 * features/api/keys.ts, features/admin/roles.ts,
 * features/changeRequests/mutations.ts,
 * features/variables/requests/mutations.ts, features/admin/migrations.ts,
 * and five CLI modules under apps/cli/src/. Until those move, an
 * environment change still has to touch them by hand.
 */
export const VALID_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
] as const;

export type EnvironmentName = (typeof VALID_ENVIRONMENTS)[number];

export function isValidEnvironment(value: string): value is EnvironmentName {
  return (VALID_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * Names that are not environments, for an error a caller can act on.
 *
 * An unknown name used to be accepted and resolve to zero rows, so
 * `?environment=prod` returned 200 with an empty body and CI deployed with
 * no variables and a green check.
 */
export function unknownEnvironments(values: readonly string[]): string[] {
  return values.filter((value) => !isValidEnvironment(value));
}

export const ENVIRONMENT_LIST_TEXT = VALID_ENVIRONMENTS.join(", ");
