/**
 * Pure, vscode-free helpers for deriving per-environment .env filenames.
 *
 * Mirrors the CLI's `getEnvPathForEnvironment`
 * (apps/cli/src/lib/env-file.ts) so both surfaces agree on naming:
 *   development → .env.local
 *   <anything>  → .env.<environment>
 *
 * Kept import-free so it can be unit-tested hermetically under plain Node
 * (see vitest.config.ts — it only picks up `src/**\/*.test.ts`).
 */

/**
 * Map a single environment name to its conventional .env filename.
 * "development" is special-cased to ".env.local" to match local-dev
 * tooling expectations; every other environment becomes ".env.<env>".
 */
export function envFileNameFor(environment: string): string {
  if (environment === "development") {
    return ".env.local";
  }
  return `.env.${environment}`;
}

/**
 * Derive the environment → filename mapping for a linked directory.
 *
 * - Single-environment directories keep honoring the stored `targetFile`
 *   (back-compat — users may have customized it, and existing configs must
 *   not silently move their file).
 * - Multi-environment directories fan out to one conventional file per
 *   environment via {@link envFileNameFor}; `targetFile` is ignored.
 *
 * Filenames are derived at runtime — nothing new is persisted.
 */
export function envFileNamesFor(directory: {
  environments: string[];
  targetFile: string;
}): Map<string, string> {
  const map = new Map<string, string>();
  const { environments, targetFile } = directory;

  if (environments.length === 1) {
    map.set(environments[0], targetFile);
    return map;
  }

  for (const env of environments) {
    map.set(env, envFileNameFor(env));
  }
  return map;
}
