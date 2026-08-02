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

export interface MaterialiseResult {
  written: string[];
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
 * Resolve a server-supplied path inside the workspace, refusing escapes.
 *
 * The server validates paths, but this process is what actually writes into
 * someone's workspace — a server bug or a tampered response must not be able
 * to reach outside it.
 */
export function resolveInsideRoot(root: string, filePath: string): string {
  if (isAbsolute(filePath)) {
    throw new Error(`Refusing to write an absolute path: ${filePath}`);
  }
  const absoluteRoot = resolve(root);
  const destination = resolve(absoluteRoot, filePath);
  const rel = relative(absoluteRoot, destination);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the workspace: ${filePath}`);
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
  if (!existsSync(destination)) return "missing";
  const local = readFileSync(destination);
  return localDigest(local, file.digestSalt) === file.sha256
    ? "in-sync"
    : "modified";
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
        // The write already failed; nothing useful to do.
      }
    }
    throw error;
  }
  chmodSync(destination, numericMode);
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
  if (!existsSync(gitignorePath)) return [];

  const content = readFileSync(gitignorePath, "utf-8");
  const existing = new Set(
    content.split("\n").map((line) => line.trim().replace(/^\/+/, ""))
  );
  const missing = paths.filter((p) => !existing.has(p));
  if (missing.length === 0) return [];

  const block = `${
    content.endsWith("\n") || content === "" ? "" : "\n"
  }\n# Envpilot secret files\n${missing.join("\n")}\n`;
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
  options: { force?: boolean } = {}
): Promise<MaterialiseResult> {
  const result: MaterialiseResult = {
    written: [],
    unchanged: [],
    conflicts: [],
    failed: [],
  };

  const files = await api.listSecretFiles(projectId, environment);
  if (files.length === 0) return result;

  const pending: SecretFileRow[] = [];
  for (const file of files) {
    const status = statusOf(file, root);
    if (status === "in-sync") {
      result.unchanged.push(file.path);
    } else if (status === "modified" && !options.force) {
      result.conflicts.push(file.path);
    } else {
      pending.push(file);
    }
  }

  if (pending.length === 0) return result;

  ignoreSecretFilePaths(
    root,
    pending.map((f) => f.path)
  );

  for (const file of pending) {
    try {
      const content = await api.getSecretFileContent(file._id);
      writeSecretFile(
        root,
        content.path,
        Buffer.from(content.content, "base64"),
        content.mode
      );
      result.written.push(content.path);
    } catch (error) {
      // One bad file must not abort the rest of the sync, but it must be
      // reported — never swallowed into a "synced" state.
      result.failed.push({
        path: file.path,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return result;
}
