import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { EnvpilotApiError, fetchFiles, type EnvpilotFile } from "./api.js";
import type { ResolvedConfig } from "./config.js";

/**
 * Per-request content budget.
 *
 * The server refuses any single request whose files total over 8 MiB. Stay
 * under it with headroom rather than at it: the server counts plaintext
 * bytes, but the response also carries base64 and JSON overhead.
 */
const MAX_BATCH_BYTES = 6 * 1024 * 1024;

/**
 * Greedily pack files into batches under `budget` bytes.
 *
 * A file larger than the budget gets its own batch. The server may still
 * refuse it, but failing on that one file with a clear message beats
 * silently dropping it from the pull.
 */
export function batchByTotalSize(
  files: EnvpilotFile[],
  budget: number = MAX_BATCH_BYTES
): EnvpilotFile[][] {
  const batches: EnvpilotFile[][] = [];
  let current: EnvpilotFile[] = [];
  let total = 0;
  for (const file of files) {
    if (current.length > 0 && total + file.size > budget) {
      batches.push(current);
      current = [];
      total = 0;
    }
    current.push(file);
    total += file.size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Run `attempt`, retrying only on a 429 and only for the cooldown the SERVER
 * asked for.
 *
 * Batching deliberately turns one logical pull into several requests, so a
 * large project can legitimately reach the per-key limit mid-pull. Treating
 * that as terminal would fail the build with half the keystores written.
 * Bounded, so a genuinely wedged limiter still fails rather than hanging the
 * build forever.
 */
export async function withRateLimitRetry<T>(
  label: string,
  attempt: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((r) => setTimeout(r, ms))
): Promise<T> {
  const MAX_ATTEMPTS = 5;
  for (let i = 1; ; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      const is429 = error instanceof EnvpilotApiError && error.status === 429;
      if (!is429 || i >= MAX_ATTEMPTS) throw error;
      // Trust the server's cooldown, capped so a bad header cannot stall a
      // build for hours.
      const waitSeconds = Math.min(error.retryAfterSeconds ?? 5, 60);
      process.stderr.write(
        `envpilot: rate limited on ${label}, waiting ${waitSeconds}s (attempt ${i}/${MAX_ATTEMPTS})\n`
      );
      await sleep(waitSeconds * 1000);
    }
  }
}

/** True when `candidate` is strictly inside `root`. */
function contained(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Write one secret file to its recorded path.
 *
 * The path comes from the server and the server validates it, but this is
 * the process that actually creates files, so it re-checks containment
 * itself. A server bug or a tampered response must not be able to write
 * outside the output directory.
 */
export function writeSecretFile(root: string, file: EnvpilotFile): void {
  if (isAbsolute(file.path)) {
    throw new Error("refusing an absolute path");
  }
  if (file.content === undefined) {
    // A metadata-only row reaching the write path means the batching logic
    // asked for the wrong thing. Fail loudly rather than write an empty file
    // over a real one.
    throw new Error("server returned no content for this file");
  }

  const absoluteRoot = realpathSync.native(resolve(root));
  const destination = resolve(absoluteRoot, file.path);
  if (!contained(absoluteRoot, destination)) {
    throw new Error("refusing a path outside the output directory");
  }

  // Lexical containment is not enough: a directory inside the output root can
  // be a symlink pointing out of it, and the normalised path still looks
  // contained. Resolve the deepest EXISTING ancestor for real.
  let ancestor = dirname(destination);
  while (!existsSync(ancestor) && contained(absoluteRoot, ancestor)) {
    ancestor = dirname(ancestor);
  }
  if (existsSync(ancestor)) {
    const realAncestor = realpathSync.native(ancestor);
    if (
      realAncestor !== absoluteRoot &&
      !contained(absoluteRoot, realAncestor)
    ) {
      throw new Error("refusing a path that escapes through a symlink");
    }
  }
  try {
    if (lstatSync(destination).isSymbolicLink()) {
      throw new Error("refusing to write through a symlink");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  // A pre-existing file keeps its old (possibly world-readable) mode while
  // new secret contents land in it, so stage into a fresh exclusive temp at
  // the restrictive mode and rename over the target instead.
  mkdirSync(dirname(destination), { recursive: true });
  const mode = file.mode === "0400" ? 0o400 : 0o600;
  const temp = `${destination}.envpilot-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  try {
    writeFileSync(temp, Buffer.from(file.content, "base64"), {
      mode,
      flag: "wx",
    });
    chmodSync(temp, mode);
    renameSync(temp, destination);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // Nothing useful to do — the write already failed.
    }
    throw error;
  }
  chmodSync(destination, mode);
}

/**
 * Pull every secret file for the configured project/environment and write it
 * under `dir`. Returns the paths written.
 */
export async function pullSecretFiles(
  config: ResolvedConfig,
  dir: string
): Promise<string[]> {
  const manifest = await withRateLimitRetry("file metadata", () =>
    fetchFiles(config)
  );
  if (manifest.length === 0) return [];

  const files: EnvpilotFile[] = [];
  for (const batch of batchByTotalSize(manifest)) {
    const chunk = await withRateLimitRetry("file contents", () =>
      fetchFiles(
        config,
        batch.map((f) => f.path)
      )
    );
    files.push(...chunk);
  }

  // Create and canonicalize the root BEFORE any write: writeSecretFile
  // realpaths it, which throws ENOENT on a directory that does not exist yet.
  mkdirSync(dir, { recursive: true });
  const root = realpathSync.native(resolve(dir));

  const written: string[] = [];
  for (const file of files) {
    try {
      writeSecretFile(root, file);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`could not write ${file.path} — ${message}`);
    }
    written.push(file.path);
  }
  return written;
}
