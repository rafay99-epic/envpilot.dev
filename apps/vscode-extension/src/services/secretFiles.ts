import {
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  numericMode,
  resolveInsideRoot,
  statusOf,
  writeSecretFile,
  type FileStatus,
} from "@envpilot/secret-files";
import { chmodSync, existsSync, readFileSync } from "node:fs";
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

/** Disk helpers live in @envpilot/secret-files — shared with the CLI so a
 * containment or drift fix cannot land in one client and miss the other. */
export {
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  resolveInsideRoot,
  statusOf,
  type FileStatus,
};

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
  unchanged: string[];
  /** Local copies that differ from the server and were left alone. */
  conflicts: string[];
  failed: Array<{ path: string; message: string }>;
}

/** Count of files whose local copy is absent or stale. */
export async function countDrift(
  files: SecretFileRow[],
  root: string
): Promise<number> {
  const statuses = await Promise.all(files.map((f) => statusOf(f, root)));
  return statuses.filter((status) => status !== "in-sync").length;
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
    /**
     * Overwrite locally-modified files instead of reporting conflicts.
     * Scope it with `forcePaths` — a blanket force during a single file's
     * revert would silently destroy every OTHER hand-placed keystore in the
     * environment.
     */
    force?: boolean;
    /** Restrict `force` to these recorded paths. */
    forcePaths?: string[];
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
    const status = await statusOf(file, root);
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
    } else if (
      status === "modified" &&
      !(
        options.force &&
        (options.forcePaths === undefined ||
          options.forcePaths.includes(file.path))
      )
    ) {
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
        const absolutePath = await writeSecretFile(
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
