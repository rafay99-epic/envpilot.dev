import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { SecretFileRow } from "./api.js";

/**
 * Writing secret files to disk.
 *
 * The path comes from the server, and the server validates it — but this is
 * the process that actually creates files in someone's repository, so it
 * re-verifies containment locally too. A server bug, a downgraded client
 * talking to a newer backend, or a tampered response must not be able to
 * write outside the project root.
 */

/** Local drift state for one file, computed WITHOUT any decryption. */
export type FileStatus = "in-sync" | "modified" | "missing";

/**
 * Recompute the server's digest over a local file.
 *
 * Must stay byte-identical to convex/features/files/crypto.ts::digest —
 * sha256(salt || plaintext), base64. If these two ever disagree every file
 * reports as modified forever.
 */
export function localDigest(
  contents: Buffer,
  digestSaltBase64: string
): string {
  const salt = Buffer.from(digestSaltBase64, "base64");
  return createHash("sha256")
    .update(Buffer.concat([salt, contents]))
    .digest("base64");
}

/**
 * Resolve a server-supplied path inside `root`, refusing anything that
 * escapes. Returns the absolute destination.
 *
 * Uses resolve() + relative() rather than string matching: on a symlinked or
 * case-insensitive tree a prefix check alone is not sufficient.
 */
export function resolveInsideRoot(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`Refusing to write an absolute path: ${filePath}`);
  }
  const absoluteRoot = resolve(root);
  const destination = resolve(absoluteRoot, filePath);
  const rel = relative(absoluteRoot, destination);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `Refusing to write outside the project directory: ${filePath}`
    );
  }
  return destination;
}

/** Compare a secret file's server digest against the local copy. */
export function statusOf(file: SecretFileRow, root: string): FileStatus {
  let destination: string;
  try {
    destination = resolveInsideRoot(root, file.path);
  } catch {
    return "missing";
  }
  if (!existsSync(destination)) return "missing";
  const local = readFileSync(destination);
  return localDigest(local, file.digestSalt) === file.sha256
    ? "in-sync"
    : "modified";
}

/**
 * Write decrypted bytes to `path` atomically, at the requested mode.
 *
 * Temp file in the destination directory, chmod, then rename — the file is
 * never world-readable, not even for the instant between create and chmod,
 * and a crash mid-write cannot leave a truncated keystore in place.
 */
export function writeSecretFile(
  root: string,
  filePath: string,
  contents: Buffer,
  mode: string
): string {
  const destination = resolveInsideRoot(root, filePath);
  mkdirSync(dirname(destination), { recursive: true });

  const numericMode = mode === "0400" ? 0o400 : 0o600;
  const temp = `${destination}.envpilot-${process.pid}.tmp`;
  try {
    writeFileSync(temp, contents, { mode: 0o600 });
    chmodSync(temp, numericMode);
    renameSync(temp, destination);
  } catch (error) {
    if (existsSync(temp)) {
      try {
        unlinkSync(temp);
      } catch {
        // Nothing useful to do — the write already failed.
      }
    }
    throw error;
  }
  // rename preserves the temp file's mode, but an existing destination that
  // was replaced in some other way could differ. Assert it explicitly.
  chmodSync(destination, numericMode);
  return destination;
}

/**
 * Append secret-file paths to .gitignore.
 *
 * Called BEFORE the files are written, so there is no window in which a
 * signing key exists in the tree while git still considers it untracked-and-
 * offerable. A path already covered by an exact line is skipped; broader
 * glob coverage is not evaluated (a duplicate line is harmless, a missed one
 * is not).
 */
export function ignoreSecretFilePaths(root: string, paths: string[]): string[] {
  const gitignorePath = join(root, ".gitignore");
  if (!existsSync(gitignorePath)) return [];

  const content = readFileSync(gitignorePath, "utf-8");
  const existing = new Set(
    content.split("\n").map((line) => line.trim().replace(/^\/+/, ""))
  );

  // The atomic write leaves a `<dest>.envpilot-<pid>.tmp` beside the target
  // for an instant. The catch path unlinks it, but a SIGKILL mid-write would
  // not — and that temp file holds plaintext. Ignore the pattern so a
  // survivor is never offerable to git.
  const TEMP_PATTERN = "*.envpilot-*.tmp";
  const wanted = [...paths.map((p) => p.split(sep).join("/")), TEMP_PATTERN];
  const missing = wanted.filter((p) => !existing.has(p));
  if (missing.length === 0) return [];

  const block = `${content.endsWith("\n") || content === "" ? "" : "\n"}\n# Envpilot secret files\n${missing.join("\n")}\n`;
  writeFileSync(gitignorePath, content + block, "utf-8");
  return missing;
}
