/**
 * `--mount <path>`: hand secrets to a tool that only knows how to read a file.
 *
 * The path is a FIFO, so the dotenv text exists only while something is
 * reading it. Nothing is ever committed, backed up, or left behind after the
 * run. Consumers that work: `cat`, `bash` (`source`, `set -a`), `python`,
 * `node --env-file`, docker `--env-file`. One that does NOT: POSIX `sh`'s `.`
 * builtin reads a FIFO as empty and returns success, so a script that sources
 * the mount under `sh` gets no variables and no error. Use bash there.
 */

import { lstatSync, rmSync, type Stats } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { serveSecretsPipe, toDotenv, type SecretsPipe } from "./pipe.js";

export interface MountOptions {
  /** Stop serving after this many reads. Unbounded when omitted. */
  maxReads?: number;
}

/**
 * Serve `values` as a dotenv payload at a caller-chosen path, relative to cwd.
 *
 * Refuses anything that already exists and is not our own leftover FIFO.
 * Replacing a real .env with a pipe would destroy it, and the user asked for a
 * mount, not a delete.
 */
export function mountSecrets(
  values: Map<string, string>,
  mountPath: string,
  options?: MountOptions
): SecretsPipe {
  const target = resolve(process.cwd(), mountPath);
  const existing = lstatSync(target, { throwIfNoEntry: false });

  if (existing) {
    if (!existing.isFIFO()) {
      throw new Error(
        `Refusing to mount over ${target}: a ${describe(existing)} already exists there. Choose a path that does not exist, or remove it first.`
      );
    }
    // A FIFO left by a previous run that died before cleanup. Ours to reclaim.
    rmSync(target, { force: true });
  }

  return serveSecretsPipe({
    dir: dirname(target),
    filename: basename(target),
    payload: toDotenv(values),
    maxReads: options?.maxReads,
  });
}

function describe(stats: Stats): string {
  if (stats.isDirectory()) return "directory";
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isSocket()) return "socket";
  return "file";
}
