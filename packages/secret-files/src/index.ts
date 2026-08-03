import { createHash } from "node:crypto";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { open as openFile, readFile, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Writing secret files to disk.
 *
 * ONE copy, shared by the CLI and the VS Code extension. They used to hold
 * byte-identical duplicates of this logic, which meant every containment or
 * drift fix had to be made twice and silently drifted when it was not.
 *
 * The path comes from the server, and the server validates it — but this is
 * the code that actually creates files in someone's repository, so it
 * re-verifies containment locally too. A server bug, a downgraded client
 * talking to a newer backend, or a tampered response must not be able to
 * write outside the project root.
 */

/** Local drift state for one file, computed WITHOUT any decryption. */
export type FileStatus = "in-sync" | "modified" | "missing";

/** The subset of a server file row these helpers need. */
export interface SecretFileDigestRow {
  path: string;
  sha256: string;
  digestSalt: string;
}

/**
 * A local path that is unsafe to write or read, as opposed to one that is
 * merely absent.
 *
 * The distinction matters: `statusOf` must report an unsafe path as a local
 * CONFLICT, not as "missing". Treating it as missing made pull fetch and
 * decrypt the file before the write refused it — the decrypt, and its audit
 * entry, happened for nothing.
 */
export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafePathError";
  }
}

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
    throw new UnsafePathError(
      `Refusing to write an absolute path: ${filePath}`
    );
  }
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolve(absoluteRoot, filePath);

  if (!isContained(absoluteRoot, destination)) {
    throw new UnsafePathError(
      `Refusing to write outside the project directory: ${filePath}`
    );
  }

  // Walk up to the deepest ancestor that exists and resolve it for real.
  // A symlinked parent that escapes the root is rejected here even though
  // the lexical check above passed.
  let ancestor = dirname(destination);
  while (!existsSync(ancestor) && isContained(absoluteRoot, ancestor)) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(ancestor)) {
    const realAncestor = realpathSync.native(ancestor);
    if (
      realAncestor !== absoluteRoot &&
      !isContained(absoluteRoot, realAncestor)
    ) {
      throw new UnsafePathError(
        `Refusing to write through a symlink that escapes the project: ${filePath}`
      );
    }
  }

  // The destination itself must not be a symlink pointing elsewhere.
  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new UnsafePathError(
        `Refusing to write through a symlink: ${filePath}`
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  return destination;
}

function isContained(absoluteRoot: string, candidate: string): boolean {
  const rel = relative(absoluteRoot, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
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

/**
 * Compare a secret file's server digest against the local copy.
 *
 * Async because the CONTENT read is the one genuinely slow step, and the VS
 * Code extension calls this per file on every sync — a synchronous read of
 * several multi-megabyte keystores blocks the extension host, freezing
 * command and UI processing until the loop finishes. The metadata syscalls
 * around it stay synchronous: they are sub-millisecond and making them async
 * would only widen the symlink races the checks exist to close.
 */
export async function statusOf(
  file: SecretFileDigestRow,
  root: string
): Promise<FileStatus> {
  let destination: string;
  try {
    destination = resolveInsideRoot(root, file.path);
  } catch (error) {
    // An unsafe path is a local CONFLICT, not an absence. Reporting it as
    // missing made pull fetch and decrypt a file it was then going to refuse
    // to write — a pointless decrypt and a pointless audit entry.
    return error instanceof UnsafePathError ? "modified" : "missing";
  }

  // A directory, FIFO, or symlink at the recorded path is NOT something to
  // silently overwrite, and an unreadable file must not abort the whole
  // sync — both report as a local conflict so the rest still proceeds.
  let stats;
  try {
    stats = lstatSync(destination);
  } catch (error) {
    // ONLY absence is "missing". EACCES, EIO, ELOOP and friends mean we
    // cannot tell what is there, and "safe to overwrite" is the one answer
    // that must never be a guess.
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? "missing"
      : "modified";
  }
  if (!stats.isFile()) return "modified";

  try {
    const local = await readFile(destination);
    return localDigest(local, file.digestSalt) === file.sha256
      ? "in-sync"
      : "modified";
  } catch {
    return "modified";
  }
}

/**
 * Create every missing directory component of `destination`, refusing to
 * traverse a symlink.
 *
 * mkdirSync(..., {recursive: true}) happily follows a symlinked component,
 * so a local attacker who wins the window between validation and the write
 * can redirect the whole subtree. Creating one component at a time and
 * lstat-ing each one shrinks that window to a single component.
 *
 * ponytail: this is as far as Node's stdlib goes — there is no openat(2),
 * so a component swapped between our lstat and the next syscall is still
 * theoretically reachable. Closing it fully needs descriptor-relative
 * traversal via a native addon; the residual attacker must already have
 * write access inside the project root, where they can read the pulled
 * secret anyway.
 */
function mkdirNoFollow(absoluteRoot: string, destination: string): string {
  const dir = dirname(destination);
  const rel = relative(absoluteRoot, dir);
  if (rel === "") return dir;

  let current = absoluteRoot;
  for (const segment of rel.split(sep)) {
    current = join(current, segment);
    try {
      mkdirSync(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stats = lstatSync(current);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new UnsafePathError(
        `Refusing to write through "${relative(absoluteRoot, current)}" — it is not a real directory`
      );
    }
  }
  return dir;
}

/**
 * Write decrypted bytes to `path` atomically, at the requested mode.
 *
 * Temp file in the destination directory, chmod, then rename — the file is
 * never world-readable, not even for the instant between create and chmod,
 * and a crash mid-write cannot leave a truncated keystore in place.
 */
export async function writeSecretFile(
  root: string,
  filePath: string,
  contents: Buffer,
  mode: string
): Promise<string> {
  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolveInsideRoot(absoluteRoot, filePath);
  const dir = mkdirNoFollow(absoluteRoot, destination);

  // The directory we are about to write into must still be the one inside
  // the root — re-resolved AFTER creation, so a component swapped during
  // mkdir is caught before any plaintext exists on disk.
  const realDir = realpathSync.native(dir);
  if (realDir !== absoluteRoot && !isContained(absoluteRoot, realDir)) {
    throw new UnsafePathError(
      `Refusing to write through a symlink that escapes the project: ${filePath}`
    );
  }

  const target = numericMode(mode);
  // Unpredictable name + O_EXCL + O_NOFOLLOW: a predictable temp path can be
  // pre-created as a symlink by another local user, and a following write
  // would deliver the plaintext secret somewhere else entirely.
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    const handle = await openFile(
      temp,
      fsConstants.O_WRONLY |
        fsConstants.O_CREAT |
        fsConstants.O_EXCL |
        fsConstants.O_NOFOLLOW,
      0o600
    );
    try {
      await handle.write(contents);
      await handle.chmod(target);
    } finally {
      await handle.close();
    }
    renameSync(temp, destination);
  } catch (error) {
    if (existsSync(temp)) {
      try {
        await unlink(temp);
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

  // A symlinked .gitignore would make this append write through to whatever
  // it points at — including a dangling link, which creates the target.
  let content = "";
  let exists = false;
  try {
    const stats = lstatSync(gitignorePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new UnsafePathError(
        ".gitignore is not a regular file — refusing to modify it"
      );
    }
    exists = true;
    content = readFileSync(gitignorePath, "utf-8");
  } catch (error) {
    if (error instanceof UnsafePathError) throw error;
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Absent. Created exclusively below, so a concurrent creator cannot be
    // silently overwritten.
  }

  // The atomic write leaves a `<dest>.envpilot-<pid>-<rand>.tmp` beside the
  // target for an instant. The catch path unlinks it, but a SIGKILL mid-write
  // would not — and that temp file holds plaintext. Ignore the pattern so a
  // survivor is never offerable to git.
  const TEMP_PATTERN = "*.envpilot-*.tmp";
  const existing = new Set(
    content.split("\n").map((line) => line.trim().replace(/^\/+/, ""))
  );
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

  if (!exists) {
    try {
      writeFileSync(gitignorePath, block, { flag: "wx" });
      return missing;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Someone created it between our lstat and here — fall through and
      // append to what they wrote rather than clobbering it.
      return ignoreSecretFilePaths(root, paths);
    }
  }

  writeFileSync(gitignorePath, content + block, "utf-8");
  return missing;
}
