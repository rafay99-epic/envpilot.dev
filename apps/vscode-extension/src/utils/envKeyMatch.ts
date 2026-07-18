// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.

/**
 * Per-language regexes matching environment-variable access expressions
 * (process.env.KEY, os.getenv("KEY"), ...). Keys are hover "languages" —
 * VS Code language ids map onto them (ts/jsx/vue all use "javascript").
 */
export const ENV_KEY_REGEX: Record<string, RegExp> = {
  javascript:
    /(?:process\.env\.([A-Za-z_][A-Za-z0-9_]*))|(?:process\.env\[["'`]([A-Za-z_][A-Za-z0-9_]*)["'`]\])/g,
  ruby: /ENV\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g,
  python:
    /os\.(?:(?:environ(?:(?:\.get\(["']([A-Za-z_][A-Za-z0-9_]*)["']\))|(?:\[["']([A-Za-z_][A-Za-z0-9_]*)["']\])))|(?:getenv\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)))/g,
  php: /(?:(?:\$_(?:SERVER|ENV)\[["']([A-Za-z_][A-Za-z0-9_]*)["']\])|(?:getenv\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)))/g,
  go: /os.Getenv\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)/g,
  java: /dotenv.get\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)/g,
  csharp:
    /Environment.GetEnvironmentVariable\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)/g,
  rust: /std::env::(?:var|var_os)\(["']([A-Za-z_][A-Za-z0-9_]*)["']\)/g,
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
    // lastIndexOf: the captured key always sits at the END of the matched
    // expression (before the closing quote/paren/bracket), so this anchors
    // correctly even when the key string also appears in the access prefix
    // (ENV['ENV'], process.env.env).
    const start = match.index + match[0].lastIndexOf(key);
    results.push({ key, start, end: start + key.length });
  }
  return results;
}
