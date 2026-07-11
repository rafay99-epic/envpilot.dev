/**
 * Dotenv-file serialization for `format=env` responses on the public REST
 * API's variables endpoint (GET /api/v1/projects/{slug}/variables).
 *
 * Duplicated (not imported) from packages/github-action/src/dotenv.ts per
 * CLAUDE.md's no-cross-package-import rule for this web app — the escaping
 * rules must stay byte-identical to the GitHub Action's serializer so a
 * value pulled via the REST API and one pulled via the Action produce the
 * same dotenv line, but the two packages are never allowed to import from
 * each other. If you change one, change both.
 *
 * Values are always single-quoted so no shell/dotenv metacharacter inside a
 * secret (`$`, `#`, backticks, spaces, newlines) is ever interpreted. The
 * only character that needs escaping inside single quotes is the single
 * quote itself, using the standard shell trick: close the quote, emit an
 * escaped literal quote, reopen the quote — `'` becomes `'\''`.
 */
export function escapeSingleQuoted(value: string): string {
  return value.split("'").join(`'\\''`);
}

export function formatDotenvLine(key: string, value: string): string {
  return `${key}='${escapeSingleQuoted(value)}'`;
}

export interface DotenvVariable {
  key: string;
  value: string;
}

export function buildDotenvContent(variables: DotenvVariable[]): string {
  if (variables.length === 0) {
    return "";
  }
  return (
    variables.map((v) => formatDotenvLine(v.key, v.value)).join("\n") + "\n"
  );
}
