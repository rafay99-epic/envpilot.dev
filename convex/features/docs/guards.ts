/**
 * Content guards. Both scanners run on EVERY write, dashboard and MCP alike.
 *
 * Secrets: REJECT only unambiguous credential material; WARN on
 * assignment-shaped lines. Deliberately not entropy-based — sample JWTs,
 * base64 payloads and SHAs are normal API-doc content, and false rejects
 * teach agents to mutate strings until they pass.
 *
 * Injection: the MCP server also serves decrypted key material via
 * `envpilot_get_file`, so a page instructing an agent to call it is an
 * exfiltration chain. This is the write-time layer; the human publication
 * gate and the docs/files scope exclusion are the stronger ones.
 */
import { ConvexError } from "convex/values";

/** Maximum stored body size. Generous for prose, bounded for cost. */
export const MAX_DOC_BODY_BYTES = 256 * 1024;

/** Length of the denormalized `docs.excerpt` preview. */
const EXCERPT_LENGTH = 200;

type SecretPattern = { label: string; re: RegExp };

/** Unambiguous credential material — a false positive blocks a write. */
const REJECT_PATTERNS: SecretPattern[] = [
  // Also covers OPENSSH, RSA, EC and the rest — the label names the shape.
  { label: "a PEM private key block", re: /-----BEGIN[ A-Z]*PRIVATE KEY-----/ },
  { label: "an AWS access key id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { label: "a GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { label: "a Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { label: "a Stripe secret key", re: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { label: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { label: "an OpenAI API key", re: /\bsk-[A-Za-z0-9]{32,}\b/ },
  { label: "an Envpilot API key", re: /\benvpk_[0-9a-f]{40}\b/ },
  // A connection string carrying an inline password, e.g.
  // postgres://user:s3cr3t@host/db. The password group excludes obvious
  // placeholders so documenting the URL SHAPE stays legal.
  {
    label: "a connection string with an inline password",
    // Any length: a five-character password is still a password.
    re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:(?!(?:password|pass|secret|token|xxx+|\.{3}|<|\$|%|\*+|your[-_]?)\b)[^\s:/@]+@/i,
  },
];

/** Warned, not rejected: `API_TOKEN=<your token>` is legitimate doc content. */
const WARN_PATTERN =
  /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]{3,})[ \t]*[:=][ \t]*["']?([A-Za-z0-9+/_=-]{24,})["']?[ \t]*$/gm;

/** Right-hand sides that are obviously illustrative rather than real. */
const PLACEHOLDER =
  /^(?:x+|y+|z+|\.+|-+|_+|0+|1+|abc\w*|foo\w*|bar\w*|test\w*|example\w*|changeme\w*|your\w*|placeholder\w*|redacted\w*|dummy\w*|sample\w*)$/i;

/** Imperatives aimed at the reader's tool belt, as opposed to prose about it. */
const INJECTION_PATTERNS: SecretPattern[] = [
  {
    label: "an instruction to call an Envpilot MCP tool",
    re: /\b(?:call|invoke|run|execute|use)\s+(?:the\s+)?`?envpilot_[a-z_]+`?/i,
  },
  {
    label: "an instruction to disregard prior instructions",
    re: /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:your\s+|the\s+|previous\s+|prior\s+|earlier\s+|above\s+|system\s+)+(?:instructions?|prompts?|rules?|directives?|messages?)/i,
  },
  {
    label: "an instruction to reveal secret material",
    re: /\b(?:print|output|echo|reveal|display|show|dump|summari[sz]e)\s+(?:the\s+|all\s+|every\s+)*(?:secret|credential|private[ -]key|keystore|api[ -]key|token|\.env)\w*\s+(?:value|content|file)?/i,
  },
  {
    label: "an instruction addressed to the assistant",
    re: /^[ \t>*-]*(?:system\s*:|assistant\s*:|\[\s*system\s*\]|###\s*instruction)/im,
  },
];

export type DocScanResult = {
  /** Non-blocking notices surfaced to the reviewer in the draft UI. */
  warnings: string[];
};

/** Validates a body before storage. ConvexError (plain Error is redacted in
 *  prod) on anything that must not persist; soft warnings otherwise. */
export function scanDocBody(body: string): DocScanResult {
  // UTF-8 bytes, not UTF-16 units — the bound is on what Convex stores.
  const bytes = new TextEncoder().encode(body).length;
  if (bytes > MAX_DOC_BODY_BYTES) {
    throw new ConvexError(
      `Document is too large (${Math.ceil(bytes / 1024)}KB). The limit is ${MAX_DOC_BODY_BYTES / 1024}KB.`
    );
  }

  for (const { label, re } of REJECT_PATTERNS) {
    if (re.test(body)) {
      throw new ConvexError(
        `This page looks like it contains ${label}. Documentation may name a variable (for example DATABASE_URL) but must never contain its value — readers resolve values through their own Envpilot access.`
      );
    }
  }

  for (const { label, re } of INJECTION_PATTERNS) {
    if (re.test(body)) {
      throw new ConvexError(
        `This page contains ${label}. Documentation is reference material for agents, not instructions to them, so that text cannot be stored.`
      );
    }
  }

  const warnings: string[] = [];
  // /g regex needs lastIndex reset per call.
  WARN_PATTERN.lastIndex = 0;
  for (const match of body.matchAll(WARN_PATTERN)) {
    const [, key, value] = match;
    if (PLACEHOLDER.test(value)) continue;
    warnings.push(
      `Line with "${key}" assigns a long literal value — make sure that is a placeholder and not a real secret.`
    );
    if (warnings.length >= 5) break;
  }

  return { warnings };
}

/** Builds the denormalized `docs.excerpt` — plain text, markdown stripped. */
export function buildExcerpt(body: string): string {
  const plain = body
    // Fenced code blocks make useless previews.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    // List markers only — an inline hyphen belongs to the word (rate-limit).
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= EXCERPT_LENGTH
    ? plain
    : `${plain.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/** URL-safe slug. Callers resolve collisions via `uniqueSlug`. */
export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : "untitled";
}

/**
 * Validate a `prUrl` before storing it.
 *
 * This value is agent-supplied and is rendered as an `href` in the dashboard,
 * so an unvalidated one is stored XSS: `javascript:...` in an anchor executes
 * on click, in the reviewer's authenticated session. Restricting the scheme
 * to http/https at the write boundary is the fix; the renderer no longer has
 * to be the only thing standing between an agent and script execution.
 *
 * Returns the normalized URL, or `undefined` for an empty input.
 */
export function normalizePrUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 500) {
    throw new ConvexError("Pull request URL is too long");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConvexError(
      "Pull request URL must be a full http(s) URL, e.g. https://github.com/org/repo/pull/1"
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConvexError("Pull request URL must use http or https");
  }
  // Basic-auth userinfo is credential material the body scanner never sees.
  if (parsed.username !== "" || parsed.password !== "") {
    throw new ConvexError("Pull request URL must not contain credentials");
  }
  return parsed.toString();
}
