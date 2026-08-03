import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  realpathSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
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
 * Resolve `filePath` under `root`, refusing anything that escapes.
 *
 * Lexical resolve()/relative() is not enough on its own: an intermediate
 * directory inside the repo can be a SYMLINK pointing outside it, and the
 * normalised string still looks contained. Since the path comes from the
 * server and this function is the client-side hardening against a tampered
 * or buggy response, the deepest EXISTING ancestor is realpath'd and
 * re-checked before the write.
 */
export function resolveInsideRoot(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`Refusing to write an absolute path: ${filePath}`);
  }
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolve(absoluteRoot, filePath);

  const contained = (candidate: string): boolean => {
    const rel = relative(absoluteRoot, candidate);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  };

  if (!contained(destination)) {
    throw new Error(
      `Refusing to write outside the project directory: ${filePath}`
    );
  }

  // Walk up to the deepest ancestor that exists and resolve it for real.
  // A symlinked parent that escapes the root is rejected here even though
  // the lexical check above passed.
  let ancestor = dirname(destination);
  while (!existsSync(ancestor) && contained(ancestor)) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(ancestor)) {
    const realAncestor = realpathSync.native(ancestor);
    if (realAncestor !== absoluteRoot && !contained(realAncestor)) {
      throw new Error(
        `Refusing to write through a symlink that escapes the project: ${filePath}`
      );
    }
  }

  // The destination itself must not be a symlink pointing elsewhere.
  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new Error(`Refusing to write through a symlink: ${filePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return destination;
}

/** The numeric mode a stored "0600"/"0400" string maps to. */
export function numericMode(mode: string): number {
  return mode === "0400" ? 0o400 : 0o600;
}

/**
 * True when the local file's permission bits already match the server's.
 *
 * Content and permissions drift independently: a careless `chmod -R`, a zip
 * extract, or a checkout can leave a byte-identical keystore world-readable.
 * Digest comparison alone reports that as "in sync", so the mode is checked
 * separately and repaired without re-downloading anything.
 */
export function modeMatches(
  root: string,
  filePath: string,
  mode: string
): boolean {
  try {
    const destination = resolveInsideRoot(root, filePath);
    if (!existsSync(destination)) return true;
    return (statSync(destination).mode & 0o777) === numericMode(mode);
  } catch {
    return true;
  }
}

/** Re-apply the recorded permissions to an already-correct local file. */
export function applyMode(root: string, filePath: string, mode: string): void {
  chmodSync(resolveInsideRoot(root, filePath), numericMode(mode));
}

/** Compare a secret file's server digest against the local copy. */
export function statusOf(file: SecretFileRow, root: string): FileStatus {
  let destination: string;
  try {
    destination = resolveInsideRoot(root, file.path);
  } catch {
    return "missing";
  }
  // A directory, FIFO, or symlink at the recorded path is NOT something to
  // silently overwrite, and an unreadable file must not abort the whole
  // sync — both report as a local conflict so the rest still proceeds.
  let stats;
  try {
    stats = lstatSync(destination);
  } catch {
    return "missing";
  }
  if (!stats.isFile()) return "modified";

  try {
    const local = readFileSync(destination);
    return localDigest(local, file.digestSalt) === file.sha256
      ? "in-sync"
      : "modified";
  } catch {
    return "modified";
  }
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

  const target = numericMode(mode);
  // Unpredictable name + O_EXCL: a predictable temp path can be pre-created
  // as a symlink by another local user, and a plain write would then follow
  // it and deliver the plaintext secret somewhere else entirely.
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, contents, { mode: 0o600, flag: "wx" });
    chmodSync(temp, target);
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
  chmodSync(destination, target);
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
  // Create it when absent. Returning early left every pulled secret
  // untracked-and-offerable in a repo that simply had no .gitignore yet —
  // exactly the repo most likely to commit one by accident.
  const content = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";
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

  // Only emit the section header once. Each `files add` appends whatever is
  // newly missing, and repeating the comment every time turns .gitignore into
  // a wall of identical headers.
  const HEADER = "# Envpilot secret files";
  const needsHeader = !content.includes(HEADER);
  const leadingNewline = content.endsWith("\n") || content === "" ? "" : "\n";
  const block =
    leadingNewline +
    (needsHeader ? `\n${HEADER}\n` : "") +
    `${missing.join("\n")}\n`;
  writeFileSync(gitignorePath, content + block, "utf-8");
  return missing;
}
