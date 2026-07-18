// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.

/**
 * Per-language regexes matching environment-variable access expressions
 * (process.env.KEY, os.getenv("KEY"), ...). Keys are hover "languages" —
 * VS Code language ids map onto them (ts/jsx/vue all use "javascript").
 */
export const ENV_KEY_REGEX: Record<string, RegExp> = {
  javascript:
    /(?:process\.env\.([A-Z][A-Z_0-9]+))|(?:process\.env\[["'`]([A-Z][A-Z_0-9]+)["'`]\])/g,
  ruby: /ENV\[['"]([A-Z][A-Z_0-9]+)['"]\]/g,
  python:
    /os\.(?:(?:environ(?:(?:\.get\(["']([A-Z][A-Z_0-9]+)["']\))|(?:\[["']([A-Z][A-Z_0-9]+)["']\])))|(?:getenv\(["']([A-Z][A-Z_0-9]+)["']\)))/g,
  php: /(?:(?:\$_(?:SERVER|ENV)\[["']([A-Z][A-Z_0-9]+)["']\])|(?:getenv\(["']([A-Z][A-Z_0-9]+)["']\)))/g,
  go: /os.Getenv\(["']([A-Z][A-Z_0-9]+)["']\)/g,
  java: /dotenv.get\(["']([A-Z][A-Z_0-9]+)["']\)/g,
  csharp: /Environment.GetEnvironmentVariable\(["']([A-Z][A-Z_0-9]+)["']\)/g,
  rust: /std::env::(?:var|var_os)\(["']([A-Z][A-Z_0-9]+)["']\)/g,
};

export interface EnvKeyMatch {
  key: string;
  /** Column of the key's first character within the line. */
  start: number;
  /** Column one past the key's last character. */
  end: number;
}

/**
 * Extract every env-key reference on a line for the given hover language.
 * The range is anchored to each match via match.index (upstream located the
 * key with line.indexOf(key), which returns the FIRST occurrence and breaks
 * when the same key appears twice on one line or earlier in a comment).
 */
export function findEnvKeyMatches(
  language: string,
  line: string
): EnvKeyMatch[] {
  const reg = ENV_KEY_REGEX[language];
  if (!reg) {
    return [];
  }

  const results: EnvKeyMatch[] = [];
  for (const match of line.matchAll(reg)) {
    const key = [...match].slice(1).find((group) => group !== undefined);
    if (key === undefined || match.index === undefined) {
      continue;
    }
    const start = match.index + match[0].indexOf(key);
    results.push({ key, start, end: start + key.length });
  }
  return results;
}
