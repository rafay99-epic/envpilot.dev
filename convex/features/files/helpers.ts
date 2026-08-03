import { ConvexError } from "convex/values";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";

/**
 * Secret-file helpers: path validation and per-environment path uniqueness.
 *
 * The path is a TRUST BOUNDARY. Every client writes this string to disk —
 * the CLI into a repo, the extension into a workspace, the GitHub Action
 * into a runner. A path that escapes the project root turns "pull my
 * secrets" into arbitrary file write. Validation lives here so no write path
 * can skip it, and it is deliberately strict: reject anything ambiguous
 * rather than trying to sanitize it into something safe.
 */

/** Hard cap. Long enough for any real nested path, short enough to bound reads. */
const MAX_PATH_LENGTH = 400;
export const MAX_FILE_NAME_LENGTH = 120;

/** Modes a client may be asked to apply. Anything else is rejected. */
export const ALLOWED_FILE_MODES = ["0600", "0400"] as const;
export type FileMode = (typeof ALLOWED_FILE_MODES)[number];
export const DEFAULT_FILE_MODE: FileMode = "0600";

/**
 * Paths a pull must never write, because writing them would let a secret
 * file rewrite the tooling that is performing the pull (or the repo's
 * history). Compared against the NORMALIZED path.
 */
const FORBIDDEN_EXACT = new Set([".envpilot", ".git", ".gitignore"]);

/**
 * Bound on the collision scan, matching queries.list. A project that cannot
 * be listed cannot be written to either — better a loud refusal than a
 * silently partial uniqueness check.
 */
const MAX_PROJECT_FILE_SCAN = 1000;
const FORBIDDEN_PREFIXES = [".git/", ".envpilot/"];

/**
 * Validate and normalize a destination path.
 *
 * Returns the canonical form to store: no leading "./", no duplicate
 * separators, no trailing slash. Throws ConvexError (never a plain Error —
 * prod redacts those to "Server Error") with a message the user can act on.
 */
export function normalizeFilePath(rawPath: string): string {
  const path = rawPath.trim();

  if (path.length === 0) {
    throw new ConvexError("A file path is required");
  }
  if (path.length > MAX_PATH_LENGTH) {
    throw new ConvexError(
      `File path is too long (max ${MAX_PATH_LENGTH} characters)`
    );
  }
  // A NUL truncates the path in any C-based syscall layer: "a\0../../etc" is
  // written as "a" by some tools and as the full string by others.
  if (path.includes("\0")) {
    throw new ConvexError("File path contains an invalid character");
  }
  // Backslashes are path separators on Windows. Allowing them would mean two
  // different separator alphabets and two different traversal checks.
  if (path.includes("\\")) {
    throw new ConvexError(
      "File path must use forward slashes and stay relative to the project root"
    );
  }
  if (path.startsWith("/") || path.startsWith("~")) {
    throw new ConvexError(
      "File path must be relative to the project root (no leading / or ~)"
    );
  }
  // Windows drive-absolute ("C:/keys/id_rsa") and UNC-ish forms.
  if (/^[a-zA-Z]:/.test(path)) {
    throw new ConvexError(
      "File path must be relative to the project root (no drive letter)"
    );
  }

  const segments: string[] = [];
  for (const segment of path.split("/")) {
    // Win32 strips component-final spaces and periods before it touches the
    // filesystem, so ".. /outside.pem" escapes the repo and ".git./config"
    // lands in .git — both after passing every check below. Refuse the shape
    // outright rather than trying to predict the rewrite.
    if (/[ .]$/.test(segment) && segment !== "." && segment !== "..") {
      throw new ConvexError(
        "File path segments must not end in a space or a period — Windows silently strips them, which changes where the file lands"
      );
    }
    // Collapse "" (from "a//b") and "." (from "./a") rather than rejecting —
    // both are unambiguous and harmless once removed.
    if (segment === "" || segment === ".") continue;
    // ".." is NEVER collapsed away. Resolving it here would accept
    // "a/../../etc/passwd" by cancelling one level and silently escaping.
    // The only safe answer is refusal.
    if (segment === "..") {
      throw new ConvexError(
        'File path must not contain ".." — it must stay inside the project root'
      );
    }
    segments.push(segment);
  }

  if (segments.length === 0) {
    throw new ConvexError("A file path is required");
  }

  const normalized = segments.join("/");
  // macOS and Windows filesystems are case-insensitive, so ".GIT/config"
  // targets the same file as ".git/config" on pull. Compare folded.
  const folded = normalized.toLowerCase();

  if (FORBIDDEN_EXACT.has(folded)) {
    throw new ConvexError(
      `"${normalized}" is reserved and cannot be used as a secret file path`
    );
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (folded.startsWith(prefix)) {
      throw new ConvexError(
        `Secret files cannot be written inside "${prefix}"`
      );
    }
  }

  return normalized;
}

/** Validate the requested POSIX mode, defaulting when absent. */
export function normalizeFileMode(mode: string | undefined): FileMode {
  if (mode === undefined) return DEFAULT_FILE_MODE;
  const trimmed = mode.trim();
  if (!(ALLOWED_FILE_MODES as readonly string[]).includes(trimmed)) {
    throw new ConvexError(
      `File mode must be one of: ${ALLOWED_FILE_MODES.join(", ")}`
    );
  }
  return trimmed as FileMode;
}

/** Validate the display name. */
export function normalizeFileName(rawName: string): string {
  const name = rawName.trim();
  if (name.length === 0) {
    throw new ConvexError("A file name is required");
  }
  if (name.length > MAX_FILE_NAME_LENGTH) {
    throw new ConvexError(
      `File name is too long (max ${MAX_FILE_NAME_LENGTH} characters)`
    );
  }
  return name;
}

/**
 * Environments where `path` already resolves to a different ACTIVE file.
 *
 * The domain rule, transplanted from variables: two active files may share a
 * path if and only if their environment sets are DISJOINT. That is what makes
 * a dev `google-services.json` and a prod one coexist while keeping every
 * (path, environment) pair resolvable to exactly one file — which is what
 * makes `envpilot pull -e production` deterministic.
 *
 * MUST be called at EVERY write path (upload, replace, metadata edit that
 * moves environments, restore-from-trash) and BEFORE any vault or blob write,
 * so a rejected upload never orphans an encrypted object.
 */
export async function findFilePathConflicts(
  ctx: QueryCtx,
  args: {
    projectId: Id<"projects">;
    path: string;
    environments: string[];
    excludeFileId?: Id<"projectFiles">;
  }
): Promise<string[]> {
  // Defense in depth at the shared choke point: an empty environments array
  // would make the file invisible to every environment-filtered read while
  // still showing in the dashboard.
  if (args.environments.length === 0) {
    throw new ConvexError("At least one environment is required");
  }

  const samePath = await ctx.db
    .query("projectFiles")
    .withIndex("by_project_and_path", (q) =>
      q.eq("projectId", args.projectId).eq("path", args.path)
    )
    .collect();

  const clashes = new Set<string>();
  for (const existing of samePath) {
    if (existing.deletedAt) continue;
    if (args.excludeFileId && existing._id === args.excludeFileId) continue;
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }

  // Case-folded collisions too: "Config.json" and "config.json" are one file
  // on a case-insensitive checkout, so pulling both would have them
  // overwrite each other silently.
  //
  // ponytail: this is an O(files-in-project) scan, bounded by the SAME 1000-row
  // ceiling queries.list already refuses to exceed — so it cannot grow past
  // what a project can list. A folded-path column plus its own index is the
  // upgrade if projects ever legitimately hold more than that.
  const foldedTarget = args.path.toLowerCase();
  const activeInProject = await ctx.db
    .query("projectFiles")
    .withIndex("by_project_deleted", (q) =>
      q.eq("projectId", args.projectId).eq("deletedAt", undefined)
    )
    .take(MAX_PROJECT_FILE_SCAN + 1);
  if (activeInProject.length > MAX_PROJECT_FILE_SCAN) {
    throw new ConvexError(
      `Project has more than ${MAX_PROJECT_FILE_SCAN} secret files — refusing to write without a complete collision check. Contact support to raise the limit.`
    );
  }
  for (const existing of activeInProject) {
    if (args.excludeFileId && existing._id === args.excludeFileId) continue;
    if (existing.path === args.path) continue; // exact match handled above
    if (existing.path.toLowerCase() !== foldedTarget) continue;
    for (const env of existing.environments) {
      if (args.environments.includes(env)) clashes.add(env);
    }
  }

  return [...clashes];
}

/** Standard user-facing message for a per-environment path clash. */
export function filePathConflictMessage(
  path: string,
  clashes: string[]
): string {
  return `A secret file already exists at "${path}" in environment(s): ${clashes.join(
    ", "
  )}. The same path is allowed only across non-overlapping environments.`;
}
