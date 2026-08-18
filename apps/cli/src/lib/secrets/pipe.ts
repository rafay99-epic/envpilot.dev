/**
 * Serve a secret payload over a named pipe (FIFO).
 *
 * A FIFO looks like a path but has no backing storage: the bytes live only in
 * the kernel buffer between our write and the reader's read. That is the whole
 * reason this module exists. Every other way of handing a dotenv payload to
 * another process leaves plaintext on a disk for something to find later.
 *
 * Shared by `heal` (rehydration shim) and `--mount` (user-chosen path).
 */

import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  createWriteStream,
  mkdtempSync,
  openSync,
  rmSync,
  type WriteStream,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringifyEnv } from "../env-file.js";

export interface SecretsPipe {
  /** Absolute path of the FIFO a consumer reads. */
  path: string;
  /**
   * Stop serving and unlink the FIFO. Idempotent, fully synchronous, and safe
   * to call from a `process.on("exit")` handler.
   */
  close(): void;
}

export interface ServePipeOptions {
  /** Directory the FIFO is created in. The caller owns its lifetime. */
  dir: string;
  filename: string;
  payload: string;
  /** Stop serving after this many completed reads. Unbounded when omitted. */
  maxReads?: number;
}

/** Serialize resolved secrets into the dotenv text both consumers expect. */
export function toDotenv(values: Map<string, string>): string {
  return stringifyEnv(Object.fromEntries(values));
}

/**
 * Whether FIFO delivery can work here. Windows has no `mkfifo` and no FIFOs;
 * callers fall back to whatever they did before rather than failing.
 */
export function isPipeSupported(): boolean {
  if (process.platform === "win32") return false;
  if (mkfifoAvailable === undefined) {
    try {
      execFileSync("/bin/sh", ["-c", "command -v mkfifo"], { stdio: "ignore" });
      mkfifoAvailable = true;
    } catch {
      mkfifoAvailable = false;
    }
  }
  return mkfifoAvailable;
}

/**
 * A private scratch directory for pipes and generated shims. `mkdtemp(3)`
 * creates with mode 0700, so no other user on the box can even list it.
 */
export function createSecretsDir(): string {
  return mkdtempSync(join(tmpdir(), "envpilot-"));
}

/**
 * Create the FIFO and keep it served until `close()`.
 *
 * The payload is re-offered after every read, because one `envpilot run` can
 * front a dev server that spawns many child processes, each of which reads
 * once. A FIFO delivers a payload to exactly one open/close cycle.
 */
export function serveSecretsPipe(options: ServePipeOptions): SecretsPipe {
  const { dir, filename, payload, maxReads } = options;
  const path = join(dir, filename);

  execFileSync("mkfifo", ["-m", "600", path]);

  let closed = false;
  let reads = 0;
  let current: WriteStream | null = null;

  const unlink = (): void => {
    try {
      rmSync(path, { force: true });
    } catch {
      // Already gone.
    }
  };

  const serve = (): void => {
    if (closed) return;
    // Nothing will be served again, so the FIFO has to go: opening a FIFO for
    // reading blocks until a writer shows up, and a reader that arrives after
    // the quota would wait forever. ENOENT is the honest answer.
    if (maxReads !== undefined && reads >= maxReads) {
      unlink();
      return;
    }

    // openSync(fifo, "w") blocks the event loop until a reader arrives.
    // createWriteStream opens on the threadpool, so the CLI stays responsive.
    const stream = createWriteStream(path, { flags: "w" });
    current = stream;

    // EPIPE means a reader took what it wanted and left, which is normal and
    // the next reader still deserves a payload. Anything else (ENOENT after
    // teardown, EACCES) would otherwise spin this loop, so it stops serving.
    let retry = true;
    stream.on("error", (err: NodeJS.ErrnoException) => {
      retry = err.code === "EPIPE";
    });
    stream.on("close", () => {
      if (current === stream) current = null;
      // createWriteStream defers its open by a tick and opens with O_CREAT, so
      // a close() that lands in that window recreates the path as an empty
      // regular file. Unlink again now that the open has actually settled.
      if (closed || !retry) {
        unlink();
        return;
      }
      reads += 1;
      serve();
    });

    stream.end(payload);
  };

  serve();

  return {
    path,
    close(): void {
      if (closed) return;
      closed = true;

      // The pending writer open() sits on the libuv threadpool where destroy()
      // cannot cancel it, and an uncancelled request keeps the process from
      // exiting. Opening the read end non-blocking lets that open complete.
      try {
        closeSync(
          openSync(path, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK)
        );
      } catch {
        // Already gone.
      }

      current?.destroy();
      current = null;
      unlink();
    },
  };
}

let mkfifoAvailable: boolean | undefined;
