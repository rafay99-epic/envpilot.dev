// Portions derived from DopplerHQ/vscode (https://github.com/DopplerHQ/vscode), Apache-2.0.
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
  start: number;
  end: number;
}

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
    const start = match.index + match[0].lastIndexOf(key);
    results.push({ key, start, end: start + key.length });
  }
  return results;
}
