import type { EnvpilotVariable } from "./api.js";

/**
 * Serialize variables to dotenv text.
 *
 * Every value is single-quoted with embedded quotes escaped, so a value
 * containing spaces, `#`, `$` or a newline round-trips through `set -a; .
 * file` and through Compose's `env_file` without the shell re-interpreting
 * it. Unquoted output is the usual source of "my JSON credential arrived
 * truncated at the first space".
 */
export function buildDotenv(variables: EnvpilotVariable[]): string {
  if (variables.length === 0) return "";
  const lines = variables.map(
    ({ key, value }) => `${key}='${value.replaceAll("'", `'\\''`)}'`
  );
  return `${lines.join("\n")}\n`;
}
