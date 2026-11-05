/**
 * The platform's environment names.
 *
 * This triple was copy-pasted into nine places (the API key validator, the
 * admin role validator, a migration, the MCP tool schema, and five CLI
 * modules), which is how the MCP write path ended up with no server-side
 * check at all. New code imports from here.
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
