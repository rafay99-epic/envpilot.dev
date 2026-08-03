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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ApiService, SecretFileRow } from "./api";

/**
 * Materialising secret files into the workspace.
 *
 * Mirrors apps/cli/src/lib/secret-files.ts deliberately: the two clients must
 * produce byte-identical results on disk, including the digest algorithm and
 * the file mode, or a repo synced by one and checked by the other reports
 * permanent drift.
 *
 * Everything here is metadata-driven except `materialise`, which is the only
 * function that fetches (and therefore decrypts, and therefore audits).
 */

export type FileStatus = "in-sync" | "modified" | "missing";

/** A file this run actually wrote, with everything the guards need. */
export interface WrittenSecretFile {
  /** Path relative to the workspace root, as recorded on the server. */
  path: string;
  /** Absolute on-disk path. */
  absolutePath: string;
  /** Permission bits applied ("0600" | "0400"). */
  mode: string;
  /** Numeric form of `mode`, for chmod. */
  numericMode: number;
}

export interface MaterialiseResult {
  written: string[];
  /** Same set as `written`, with the detail the VS Code guards need. */
  writtenFiles: WrittenSecretFile[];
  unchanged: string[];
  /** Local copies that differ from the server and were left alone. */
  conflicts: string[];
  failed: Array<{ path: string; message: string }>;
}

/**
 * Recompute the server digest over local bytes.
 *
 * Must stay byte-identical to convex/features/files/crypto.ts::digest and to
 * the CLI's localDigest — sha256(salt || plaintext), base64.
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

/** Drift state for one file — no decryption, no network. */
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

function numericMode(mode: string): number {
  return mode === "0400" ? 0o400 : 0o600;
}

/**
 * True when the local file's permission bits match the server's.
 *
 * Content and permissions drift independently — a byte-identical keystore
 * left world-readable still needs repairing, and the digest alone reports it
 * as in sync.
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

/** Count of files whose local copy is absent or stale. */
export function countDrift(files: SecretFileRow[], root: string): number {
  return files.filter((file) => statusOf(file, root) !== "in-sync").length;
}

function writeSecretFile(
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
        // The write already failed; nothing useful to do.
      }
    }
    throw error;
  }
  chmodSync(destination, target);
  return destination;
}

/**
 * Append secret-file paths to .gitignore, BEFORE anything is written.
 *
 * Ordering matters: there must be no window in which a signing key exists in
 * the tree while git still offers it as untracked.
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
  const missing = [...paths, TEMP_PATTERN].filter((p) => !existing.has(p));
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

/**
 * Fetch and write every stale or missing secret file for a project.
 *
 * Files already in sync are skipped WITHOUT a fetch, so a routine sync of an
 * up-to-date workspace performs zero decrypts and writes zero audit rows.
 * Locally-modified files are reported as conflicts and left untouched unless
 * `force` — losing someone's debug keystore silently is worse than a warning.
 */
export async function materialiseSecretFiles(
  api: ApiService,
  projectId: string,
  environment: string,
  root: string,
  options: {
    force?: boolean;
    /**
     * Called for each file as it is written, while its plaintext is still in
     * hand. sync.ts uses this to register the same guards a synced .env gets
     * (managed-file manifest, clipboard guard, edit protection) without this
     * module needing to import vscode.
     */
    onWritten?: (file: WrittenSecretFile, contents: Buffer) => Promise<void>;
    /** Suppresses the edit watcher around our own writes. */
    setSyncing?: (syncing: boolean) => void;
  } = {}
): Promise<MaterialiseResult> {
  const result: MaterialiseResult = {
    written: [],
    writtenFiles: [],
    unchanged: [],
    conflicts: [],
    failed: [],
  };

  const files = await api.listSecretFiles(projectId, environment);
  if (files.length === 0) return result;

  const pending: SecretFileRow[] = [];
  /** Files already correct on disk — they still need their guards attached. */
  const alreadyPresent: SecretFileRow[] = [];

  for (const file of files) {
    const status = statusOf(file, root);
    if (status === "in-sync") {
      // Repair loosened permissions without a fetch, a decrypt, or an audit
      // entry — the bytes are already correct.
      if (!modeMatches(root, file.path, file.mode)) {
        try {
          chmodSync(resolveInsideRoot(root, file.path), numericMode(file.mode));
        } catch {
          // Non-fatal: the contents are right, only the mode is not.
        }
      }
      result.unchanged.push(file.path);
      alreadyPresent.push(file);
    } else if (status === "modified" && !options.force) {
      result.conflicts.push(file.path);
      // Still guard it: the bytes differ from the server, but it IS a secret
      // file sitting in the workspace and must not be copyable.
      alreadyPresent.push(file);
    } else {
      pending.push(file);
    }
  }

  // Attach guards to files this run did NOT write. Without this the guards
  // only ever existed on the sync that first created a file: every later
  // sync (and every window reload) saw "in-sync", skipped the write, and left
  // a decrypted secret sitting in the editor with no clipboard protection.
  for (const file of alreadyPresent) {
    if (!options.onWritten) break;
    try {
      const absolutePath = resolveInsideRoot(root, file.path);
      if (!existsSync(absolutePath)) continue;
      await options.onWritten(
        {
          path: file.path,
          absolutePath,
          mode: file.mode,
          numericMode: numericMode(file.mode),
        },
        readFileSync(absolutePath)
      );
    } catch {
      // Guard registration must never break a sync.
    }
  }

  // Every path, not just the pending ones: a file that is already in sync
  // still needs its path ignored (it may have been written by another client
  // or restored from a backup into a repo whose .gitignore predates it).
  ignoreSecretFilePaths(
    root,
    files.map((f) => f.path)
  );

  if (pending.length === 0) return result;

  // Suppress the unauthorized-edit watcher for our own writes, exactly as the
  // .env path does — otherwise re-writing a protected file trips its own guard.
  options.setSyncing?.(true);
  try {
    for (const file of pending) {
      try {
        const content = await api.getSecretFileContent(file._id);
        const bytes = Buffer.from(content.content, "base64");
        const absolutePath = writeSecretFile(
          root,
          content.path,
          bytes,
          content.mode
        );
        const written: WrittenSecretFile = {
          path: content.path,
          absolutePath,
          mode: content.mode,
          numericMode: numericMode(content.mode),
        };
        result.written.push(content.path);
        result.writtenFiles.push(written);
        await options.onWritten?.(written, bytes);
      } catch (error) {
        // One bad file must not abort the rest of the sync, but it must be
        // reported — never swallowed into a "synced" state.
        result.failed.push({
          path: file.path,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  } finally {
    options.setSyncing?.(false);
  }

  return result;
}
