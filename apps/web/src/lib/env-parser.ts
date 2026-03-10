export interface ParsedEnvEntry {
  key: string;
  value: string;
  line: number;
}

export interface EnvParseError {
  line: number;
  text: string;
  reason: string;
}

export interface EnvParseResult {
  entries: ParsedEnvEntry[];
  errors: EnvParseError[];
}

export function parseEnvFile(content: string): EnvParseResult {
  const lines = content.split("\n");
  const entries: ParsedEnvEntry[] = [];
  const errors: EnvParseError[] = [];
  const seen = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Must contain an = sign
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      errors.push({
        line: i + 1,
        text: trimmed,
        reason: "Missing = sign",
      });
      continue;
    }

    const rawKey = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Uppercase and sanitize key
    const key = rawKey
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, "_")
      .replace(/^[0-9]/, "_");

    // Validate key format
    if (!key || !/^[A-Z_][A-Z0-9_]*$/.test(key)) {
      errors.push({
        line: i + 1,
        text: trimmed,
        reason: `Invalid key: "${rawKey}"`,
      });
      continue;
    }

    // Track duplicates — last occurrence wins
    const prevIndex = seen.get(key);
    if (prevIndex !== undefined) {
      // Remove the previous entry
      const idx = entries.findIndex(
        (e) => e.key === key && e.line === prevIndex
      );
      if (idx !== -1) {
        entries.splice(idx, 1);
      }
    }
    seen.set(key, i + 1);

    entries.push({ key, value, line: i + 1 });
  }

  return { entries, errors };
}
