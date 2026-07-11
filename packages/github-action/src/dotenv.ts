/**
 * Dotenv-file serialization for the pulled variables.
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
