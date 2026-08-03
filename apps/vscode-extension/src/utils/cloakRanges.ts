/**
 * Format-aware masking for secret files.
 *
 * Masking a whole file turns a service-account JSON into an unreadable wall
 * of bullets — you cannot even tell which file you are looking at. What is
 * actually secret is the VALUES; the keys and the structure are what make
 * the file navigable.
 *
 * So each format contributes its own value ranges: keys, punctuation and
 * indentation stay visible, values get covered. Formats with no useful
 * structure (PEM bodies, unknown binary-ish blobs) still mask wholesale,
 * because there every byte is the secret.
 *
 * Pure module — no vscode import — so the range maths is unit-testable
 * (same convention as clipboardScope.ts and envFiles.ts).
 */

export type CloakFormat =
  | "env"
  | "json"
  | "yaml"
  | "toml"
  | "properties"
  | "pem"
  | "opaque";

/** A half-open [start, end) character span on a given zero-based line. */
export interface CloakRange {
  line: number;
  start: number;
  end: number;
}

/** PEM armour: the markers stay readable, the base64 body does not. */
const PEM_BEGIN = /^\s*-----BEGIN [^-]+-----\s*$/;
const PEM_END = /^\s*-----END [^-]+-----\s*$/;

/** `KEY=value` — the .env shape. Captures the value. */
const ENV_LINE = /^\s*[A-Za-z_][A-Za-z0-9_.]*\s*=(.*)$/;

/** `key: value` (YAML), allowing a leading list dash. */
const YAML_LINE = /^(\s*(?:-\s+)?(?:"[^"]*"|'[^']*'|[\w.\-/]+)\s*:\s+)(\S.*)$/;

/**
 * `key = value`, `key: value`, or `key value` — .properties and .ini accept
 * all three separators. Whitespace-separated keys are standard in
 * `.properties` files and were previously left fully visible.
 */
const PROPERTIES_LINE =
  /^(\s*(?:"[^"]*"|'[^']*'|[\w.\-]+)(?:\s*[=:]\s*|\s+))(\S.*?)\s*$/;

/** `key = value` (TOML). Section headers are skipped by the caller. */
const TOML_LINE = /^(\s*(?:"[^"]*"|'[^']*'|[\w.\-]+)\s*=\s*)(\S.*?)\s*$/;

/**
 * Pick a format from the file's path.
 *
 * `languageId` wins when VS Code has already identified the document — it
 * copes with files whose extension lies (a `.txt` holding JSON) and with
 * extensionless names.
 */
export function detectCloakFormat(
  fsPath: string,
  languageId?: string
): CloakFormat {
  const name = fsPath.toLowerCase().replace(/\\/g, "/").split("/").pop() ?? "";

  // Key material is armoured text with nothing worth preserving inside.
  if (/\.(pem|key|crt|cer|p8|asc|gpg|ppk)$/.test(name)) return "pem";
  if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) return "pem";

  // Binary containers never reach a text editor intact; mask defensively.
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

/** Offset of the first non-whitespace character (indentation is structure). */
function indentOf(text: string): number {
  return text.length - text.trimStart().length;
}

/** True when the value is a nested container rather than a scalar. */
function isStructural(value: string): boolean {
  const t = value.trim();
  return t === "" || t === "{" || t === "[" || t === "{}" || t === "[]";
}

/**
 * Extent of the JSON value that begins at `from`, or null when it opens a
 * nested container (which must stay visible so the shape survives).
 */
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

  // Bare literal: number, true/false/null, or a TOML inline-table key.
  // Ends at a separator — `=` and `:` included, so `{ user = "admin" }`
  // yields the key and the value as two tokens instead of swallowing both.
  let i = from;
  while (i < text.length && !",}]=:".includes(text[i])) i += 1;
  return trimEndIndex(text, from, i);
}

/** Index of the last non-space character in [from, to), exclusive. */
function trimEndIndex(text: string, from: number, to: number): number {
  let i = to;
  while (i > from && /\s/.test(text[i - 1])) i -= 1;
  return i;
}

/**
 * Scalars inside an inline container, e.g. the elements of
 * `["a", "b"]` or the values of `{"k": "v"}` written on one line.
 *
 * Fails closed: any element that cannot be read as a scalar is skipped by
 * the scanner, and the enclosing key/value pass masks whatever it can.
 */
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
    // `=` is the separator inside a TOML inline table, `:` inside a JSON
    // object.
    if (ch === "," || ch === ":" || ch === "=" || /\s/.test(ch)) {
      i += 1;
      continue;
    }
    const end = jsonValueEnd(text, i);
    if (end === null || end <= i) {
      i += 1;
      continue;
    }
    // A scalar followed by `:` or `=` is a KEY, not a value. Masking it made
    // `{"user": "secret"}` unreadable — the whole point of format-aware
    // cloaking is that the structure survives.
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

/** Value ranges on one JSON line — handles pretty-printed and minified. */
function jsonRangesForLine(line: number, text: string): CloakRange[] {
  const ranges: CloakRange[] = [];
  const keyed = /"(?:[^"\\]|\\.)*"\s*:\s*/g;

  let m: RegExpExecArray | null;
  while ((m = keyed.exec(text)) !== null) {
    const valueStart = m.index + m[0].length;
    const end = jsonValueEnd(text, valueStart);
    if (end === null) {
      // Structural opener. Its inline elements still have to be masked —
      // `"scopes": ["secret-a", "secret-b"]` on one line would otherwise
      // stay fully readable.
      ranges.push(...inlineScalarRanges(line, text, valueStart));
      keyed.lastIndex = valueStart + 1;
      continue;
    }
    if (end <= valueStart) continue;
    ranges.push({ line, start: valueStart, end });
    keyed.lastIndex = end;
  }

  // Bare array elements ("abc", 42) carry no key, so the loop above misses
  // them. Only consider a line that had no key/value pair at all, which
  // keeps the common `"a": ["x", "y"]` case from double-masking.
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

  // After an inline container the keyed scan resumes INSIDE it, so a nested
  // value can be produced twice. Ranges are documented as non-overlapping.
  const seen = new Set<string>();
  return ranges.filter((r) => {
    const key = `${r.start}:${r.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The two TOML multi-line string delimiters. */
const TOML_MULTILINE_DELIMITERS = ['"""', "'''"];

/**
 * Drop a trailing `# comment` from a TOML value, respecting quoting.
 *
 * `tokens = ["secret"] # note` used to look like an UNCLOSED array (the line
 * does not end in `]`), so the parser opened continuation state and left
 * `secret` visible on this very line.
 */
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

/**
 * Net `[` minus `]` on one TOML line, ignoring brackets inside quotes and
 * anything after an unquoted `#`.
 *
 * A depth COUNT is required, not a "does the line end in ]" test. In
 *
 *     a = [
 *       [1, 2],
 *       "secret"
 *     ]
 *
 * the middle line ends with `]` while the outer array is still open, so a
 * terminal-bracket test closed cloaking early and left every element below
 * it in plaintext.
 */
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

/**
 * True when `delimiter` appears in `text` UNESCAPED.
 *
 * Only basic (triple-double-quote) strings honour backslash escapes, and in
 * one of those a backslash-escaped quote followed by two more quotes is NOT a
 * terminator. A plain `includes` closed the mask there and exposed the rest
 * of the string. Literal (triple-single-quote) strings have no escapes at
 * all, so the raw search stays correct for them.
 */
function hasUnescapedDelimiter(text: string, delimiter: string): boolean {
  if (delimiter !== '"""') return text.includes(delimiter);
  for (let i = 0; i <= text.length - delimiter.length; i += 1) {
    if (text[i] === "\\") {
      i += 1; // skip the escaped character
      continue;
    }
    if (text.startsWith(delimiter, i)) return true;
  }
  return false;
}

/**
 * The multi-line string delimiter this value OPENS without closing, or null.
 *
 * WHICH delimiter matters: a literal-string body may legally contain the
 * basic-string delimiter, so closing on whichever appears first ends the
 * mask early.
 */
function opensTomlString(value: string): string | null {
  for (const delimiter of TOML_MULTILINE_DELIMITERS) {
    if (!value.startsWith(delimiter)) continue;
    const rest = value.slice(delimiter.length);
    return hasUnescapedDelimiter(rest, delimiter) ? null : delimiter;
  }
  return null;
}

/** Number of trailing backslashes — odd means a .properties continuation. */
function endsWithOddBackslash(text: string): boolean {
  const match = /(\\+)$/.exec(text);
  return match ? match[1].length % 2 === 1 : false;
}

/**
 * Compute every range that should be masked in a secret file.
 *
 * `lines` is the document split by line. Returned ranges never overlap and
 * are ordered by line.
 */
export function computeCloakRanges(
  format: CloakFormat,
  lines: string[]
): CloakRange[] {
  const ranges: CloakRange[] = [];
  let inPemBody = false;
  /** Indentation of an open YAML block scalar (`key: |`), else null. */
  let yamlBlockIndent: number | null = null;
  /** Open-bracket depth of an unterminated TOML array, 0 when outside one. */
  let tomlArrayDepth = 0;
  /** The delimiter of an open TOML multi-line string, else null. */
  let tomlStringDelimiter: string | null = null;
  /** True while a .properties value continues via a trailing backslash. */
  let propertiesContinuation = false;

  for (let line = 0; line < lines.length; line += 1) {
    const text = lines[line];
    if (text.length === 0) continue;

    // PEM armour can appear inside any format (a key pasted into a YAML
    // block, a .pem file proper) — handle it before the per-format branch.
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
        const m = ENV_LINE.exec(text);
        if (!m || m[1].length === 0) break;
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
        // A block scalar's body is the secret; only its opener is structure.
        // Without tracking indentation the whole key material stayed visible.
        if (yamlBlockIndent !== null) {
          if (indentOf(text) > yamlBlockIndent) {
            ranges.push({ line, start: indentOf(text), end: text.length });
            break;
          }
          yamlBlockIndent = null;
        }

        const trimmed = text.trimStart();
        // Comments and document markers carry no secret.
        if (trimmed.startsWith("#") || trimmed.startsWith("---")) break;
        const m = YAML_LINE.exec(text);
        if (!m) {
          const item = /^(\s*-\s+)(\S.*)$/.exec(text);
          if (item && !isStructural(item[2])) {
            ranges.push({ line, start: item[1].length, end: text.length });
          }
          break;
        }
        // A block scalar indicator (|, >, with optional chomping/indent
        // markers) is structure — remember its indentation so every body
        // line below is masked until the block dedents.
        // Both legal orders: `|-2` (chomp then indent indicator) and `|2-`
        // (indent then chomp). Accepting only the first left every body line
        // of a `key: |2-` block fully visible.
        if (/^[|>](?:[+-]\d*|\d+[+-]?)?$/.test(m[2].trim())) {
          yamlBlockIndent = indentOf(text);
          break;
        }
        if (isStructural(m[2])) break;
        ranges.push({ line, start: m[1].length, end: text.length });
        break;
      }

      case "toml": {
        // Inside a multi-line string: every line is value until the SAME
        // delimiter that opened it reappears.
        if (tomlStringDelimiter !== null) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          if (hasUnescapedDelimiter(text, tomlStringDelimiter)) {
            tomlStringDelimiter = null;
          }
          break;
        }

        // Inside a multi-line array: mask until the nesting unwinds to zero.
        if (tomlArrayDepth > 0) {
          ranges.push({ line, start: indentOf(text), end: text.length });
          tomlArrayDepth = Math.max(0, tomlArrayDepth + netBracketDelta(text));
          break;
        }

        const trimmed = text.trimStart();
        if (trimmed.startsWith("#")) break;
        // [section] and [[array-of-table]] headers are structure.
        if (trimmed.startsWith("[")) break;

        const m = TOML_LINE.exec(text);
        if (!m) {
          // FAIL CLOSED, exactly as the .properties branch does. The key
          // regex covers bare and simply-quoted keys; an escaped quoted key,
          // a dotted key with unusual spacing, or a line caught mid-edit
          // falls through it — and "leave the secret in plaintext" is not an
          // acceptable default for a file we already know holds secrets.
          if (indentOf(text) < text.length) {
            ranges.push({ line, start: indentOf(text), end: text.length });
          }
          break;
        }

        const valueStart = m[1].length;
        // Strip a trailing comment first. Without it `k = ["s"] # note` looks
        // like an unclosed array, which opened continuation state and left
        // `s` visible on this very line.
        const value = stripTomlComment(m[2]).trimEnd();
        if (value.length === 0) break;

        // Check for a multi-line opener BEFORE the structural test: a bare
        // `[`, `"""` or `'''` at the end of the line is an OPENER, not an
        // empty container, and treating it as structure left its whole body
        // visible on the lines below.
        const openDelimiter = opensTomlString(value);
        if (openDelimiter !== null) {
          tomlStringDelimiter = openDelimiter;
          // The opener itself carries no secret; the body below does.
          break;
        }
        const delta = netBracketDelta(value);
        if (value.startsWith("[") && delta > 0) {
          tomlArrayDepth = delta;
          break;
        }

        // An inline array or table that closes on this line: mask the
        // scalars, keep the brackets and any keys readable.
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
        // A `\` at the end of a logical line continues the VALUE onto the
        // next physical line — every one of those lines is secret.
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
        // [section] headers are structure.
        if (trimmed.startsWith("[")) break;

        const m = PROPERTIES_LINE.exec(text);
        if (!m) {
          // FAIL CLOSED. An unrecognised non-comment line in a secrets file
          // is more likely an exotic value shape than harmless structure, so
          // mask it rather than assume.
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
        // Indentation is structure, not secret — keep it so the shape of an
        // opaque file is still legible.
        const start = indentOf(text);
        if (start < text.length) ranges.push({ line, start, end: text.length });
        break;
      }
    }
  }

  return ranges;
}
