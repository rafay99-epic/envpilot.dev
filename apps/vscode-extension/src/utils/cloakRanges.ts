export type CloakFormat =
  | "env"
  | "json"
  | "yaml"
  | "toml"
  | "properties"
  | "pem"
  | "opaque";

export interface CloakRange {
  line: number;
  start: number;
  end: number;
}

const PEM_BEGIN = /^\s*-----BEGIN [^-]+-----\s*$/;
const PEM_END = /^\s*-----END [^-]+-----\s*$/;

const ENV_LINE = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=(.*)$/;

const YAML_LINE = /^(\s*(?:-\s+)?(?:"[^"]*"|'[^']*'|[\w.\-/]+)\s*:\s+)(\S.*)$/;
const YAML_KEY_ONLY =
  /^\s*(?:-\s+)?(?:"[^"]*"|'[^']*'|[\w.\-/]+)\s*:\s*(?:#.*)?$/;

const PROPERTIES_LINE =
  /^(\s*(?:"[^"]*"|'[^']*'|[\w.\-]+)(?:\s*[=:]\s*|\s+))(\S.*?)\s*$/;

const TOML_LINE = /^(\s*(?:"[^"]*"|'[^']*'|[\w.\-]+)\s*=\s*)(\S.*?)\s*$/;

export function detectCloakFormat(
  fsPath: string,
  languageId?: string
): CloakFormat {
  const name = fsPath.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "";

  if (/\.(pem|key|crt|cer|p8|asc|gpg|ppk)$/.test(name)) return "pem";
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return "pem";

  if (/\.(jks|keystore|p12|pfx|mobileprovision|der)$/.test(name)) {
    return "opaque";
  }

  if (/(^|\/)\.env($|\.)/.test(name) || name.startsWith(".env")) return "env";
  if (/\.(json|jsonc)$/.test(name)) return "json";
  if (/\.(ya?ml)$/.test(name)) return "yaml";
  if (/\.toml$/.test(name)) return "toml";
  if (/\.(properties|ini|cfg|conf)$/.test(name)) return "properties";
  if (/\.(plist|xml)$/.test(name)) return "opaque";

  switch (languageId) {
    case "json":
    case "jsonc":
      return "json";
    case "yaml":
      return "yaml";
    case "toml":
      return "toml";
    case "properties":
      return "properties";
    case "dotenv":
      return "env";
    default:
      return "opaque";
  }
}

function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

function isStructural(value: string): boolean {
  const t = value.trim();
  return t === "" || t === "{" || t === "[" || t === "{}" || t === "[]";
}

function jsonValueEnd(text: string, from: number): number | null {
  const ch = text[from];
  if (ch === undefined || ch === "{" || ch === "[") return null;

  if (ch === '"') {
    let i = from + 1;
    while (i < text.length) {
      if (text[i] === "\\") {
        i += 2;
        continue;
      }
      if (text[i] === '"') return i + 1;
      i += 1;
    }
    return text.length;
  }

  let i = from;
  while (i < text.length && !",}]=:".includes(text[i])) i += 1;
  return trimEndIndex(text, from, i);
}

function trimEndIndex(text: string, from: number, to: number): number {
  let i = to;
  while (i > from && /\s/.test(text[i - 1])) i -= 1;
  return i;
}

function inlineScalarRanges(
  line: number,
  text: string,
  from: number
): CloakRange[] {
  const ranges: CloakRange[] = [];
  let i = from;
  let depth = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "[" || ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "]" || ch === "}") {
      depth -= 1;
      i += 1;
      if (depth <= 0) break;
      continue;
    }
    if (ch === "," || ch === ":" || ch === "=" || /\s/.test(ch)) {
      i += 1;
      continue;
    }
    const end = jsonValueEnd(text, i);
    if (end === null || end <= i) {
      i += 1;
      continue;
    }
    const after = text.slice(end).match(/^\s*([:=])/);
    if (after) {
      i = end;
      continue;
    }
    ranges.push({ line, start: i, end });
    i = end;
  }

  return ranges;
}

function jsonRangesForLine(line: number, text: string): CloakRange[] {
  const ranges: CloakRange[] = [];
  const keyed = /"(?:[^"\\]|\\.)*"\s*:\s*/g;

  let m: RegExpExecArray | null;
  while ((m = keyed.exec(text)) !== null) {
    const valueStart = m.index + m[0].length;
    const end = jsonValueEnd(text, valueStart);
    if (end === null) {
      ranges.push(...inlineScalarRanges(line, text, valueStart));
      keyed.lastIndex = valueStart + 1;
      continue;
    }
    if (end <= valueStart) continue;
    ranges.push({ line, start: valueStart, end });
    keyed.lastIndex = end;
  }

  if (ranges.length === 0) {
    const bare =
      /^(\s*)("(?:[^"\\]|\\.)*"|-?\d[\d.eE+-]*|true|false|null)(,?)\s*$/.exec(
        text
      );
    if (bare) {
      ranges.push({
        line,
        start: bare[1].length,
        end: bare[1].length + bare[2].length,
      });
    }
  }

  const seen = new Set<string>();
  return ranges.filter((r) => {
    const key = `${r.start}:${r.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TOML_MULTILINE_DELIMITERS = ['"""', "'''"];

function stripTomlComment(value: string): string {
  let quote: string | null = null;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i];
    if (quote) {
      if (ch === "\\" && quote === '"') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") return value.slice(0, i).trimEnd();
  }
  return value;
}

function netBracketDelta(text: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\" && quote === '"') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "#") break;
    if (ch === "[") depth += 1;
    else if (ch === "]") depth -= 1;
  }
  return depth;
}

function hasUnescapedDelimiter(text: string, delimiter: string): boolean {
  if (delimiter !== '"""') return text.includes(delimiter);
  for (let i = 0; i <= text.length - delimiter.length; i += 1) {
    if (text[i] === "\\") {
      i += 1;
      continue;
    }
    if (text.startsWith(delimiter, i)) return true;
  }
  return false;
}

function opensTomlString(value: string): string | null {
  for (const delimiter of TOML_MULTILINE_DELIMITERS) {
    if (!value.startsWith(delimiter)) continue;
    const rest = value.slice(delimiter.length);
    return hasUnescapedDelimiter(rest, delimiter) ? null : delimiter;
  }
  return null;
}

function endsWithOddBackslash(text: string): boolean {
  const match = /(\\+)$/.exec(text);
  return match ? match[1].length % 2 === 1 : false;
}

export function computeCloakRanges(
  format: CloakFormat,
  lines: string[]
): CloakRange[] {
  const ranges: CloakRange[] = [];
  let inPemBody = false;
  let yamlBlockIndent: number | null = null;
  let tomlArrayDepth = 0;
  let tomlStringDelimiter: string | null = null;
  let propertiesContinuation = false;

  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line];
    if (text.length === 0) continue;

    if (PEM_BEGIN.test(text)) {
      inPemBody = true;
      continue;
    }
    if (PEM_END.test(text)) {
      inPemBody = false;
      continue;
    }
    if (inPemBody) {
      ranges.push({ line, start: indentOf(text), end: text.length });
      continue;
    }

    switch (format) {
      case "env": {
        if (text.trimStart().startsWith("#")) break;
        const m = ENV_LINE.exec(text);
        if (!m) {
          const start = indentOf(text);
          if (start < text.length)
            ranges.push({ line, start, end: text.length });
          break;
        }
        if (m[1].length === 0) break;
        ranges.push({
          line,
          start: text.length - m[1].length,
          end: text.length,
        });
        break;
      }

      case "json": {
        ranges.push(...jsonRangesForLine(line, text));
        break;
      }

      case "yaml": {
        if (yamlBlockIndent !== null) {
          if (indentOf(text) > yamlBlockIndent) {
            ranges.push({ line, start: indentOf(text), end: text.length });
            break;
          }
          yamlBlockIndent = null;
        }

        const trimmed = text.trimStart();
        if (trimmed.startsWith("#") || trimmed.startsWith("---")) break;
        const m = YAML_LINE.exec(text);
        if (!m) {
          if (YAML_KEY_ONLY.test(text)) break;
          const item = /^(\s*-\s+)(\S.*)$/.exec(text);
          if (item && isStructural(item[2])) break;
          const start = item ? item[1].length : indentOf(text);
          if (start < text.length)
            ranges.push({ line, start, end: text.length });
          break;
        }
        if (/^[|>](?:[+-]\d*|\d+[+-]?)?$/.test(m[2].trim())) {
          yamlBlockIndent = indentOf(text);
          break;
        }
        if (isStructural(m[2])) break;
        ranges.push({ line, start: m[1].length, end: text.length });
        break;
      }

      case "toml": {
        if (tomlStringDelimiter !== null) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          if (hasUnescapedDelimiter(text, tomlStringDelimiter)) {
            tomlStringDelimiter = null;
          }
          break;
        }

        if (tomlArrayDepth > 0) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          tomlArrayDepth = Math.max(0, tomlArrayDepth + netBracketDelta(text));
          break;
        }

        const trimmed = text.trimStart();
        if (trimmed.startsWith("#")) break;
        if (trimmed.startsWith("[")) break;

        const m = TOML_LINE.exec(text);
        if (!m) {
          if (indentOf(text) < text.length) {
            ranges.push({ line, start: indentOf(text), end: text.length });
          }
          break;
        }

        const valueStart = m[1].length;
        const value = stripTomlComment(m[2]).trimEnd();
        if (value.length === 0) break;

        const openDelimiter = opensTomlString(value);
        if (openDelimiter !== null) {
          tomlStringDelimiter = openDelimiter;
          break;
        }
        const delta = netBracketDelta(value);
        if (value.startsWith("[") && delta > 0) {
          tomlArrayDepth = delta;
          break;
        }

        if (value.startsWith("[") || value.startsWith("{")) {
          ranges.push(...inlineScalarRanges(line, text, valueStart));
          break;
        }

        if (isStructural(value)) break;

        ranges.push({
          line,
          start: valueStart,
          end: valueStart + value.length,
        });
        break;
      }

      case "properties": {
        if (propertiesContinuation) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          propertiesContinuation = endsWithOddBackslash(text);
          break;
        }

        const trimmed = text.trimStart();
        if (
          trimmed.startsWith("#") ||
          trimmed.startsWith(";") ||
          trimmed.startsWith("!")
        ) {
          break;
        }
        if (trimmed.startsWith("[")) break;

        const m = PROPERTIES_LINE.exec(text);
        if (!m) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          break;
        }

        const value = m[2];
        if (isStructural(value)) break;

        ranges.push({
          line,
          start: m[1].length,
          end: text.length,
        });
        propertiesContinuation = endsWithOddBackslash(text);
        break;
      }

      case "pem":
      case "opaque":
      default: {
        const start = indentOf(text);
        if (start < text.length) ranges.push({ line, start, end: text.length });
        break;
      }
    }
  }

  return ranges;
}
