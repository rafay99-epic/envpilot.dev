/**
 * Rehydrate secrets in child processes that a task runner stripped them from.
 *
 * Turborepo (and anything else with a strict env allowlist) filters the
 * environment it hands to each task, so secrets injected by `envpilot run`
 * never reach the process that needs them. `NODE_OPTIONS` survives that
 * filter. So we ride it: a generated `--require` shim reattaches to the
 * payload from inside the child, after the filter has already run.
 *
 * The shim source carries the FIFO path baked in, not an env var pointing at
 * it, because a custom variable like ENVPILOT_MOUNT gets stripped by the same
 * filter we are working around. The shim file itself holds a path and nothing
 * else; no secret value is ever written to disk here.
 */

import {
  existsSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSecretsDir,
  isPipeSupported,
  serveSecretsPipe,
  toDotenv,
  type SecretsPipe,
} from "./pipe.js";

export interface HealHandle {
  /**
   * The fragment to APPEND to any existing NODE_OPTIONS. Callers compose:
   * `existing ? `${existing} ${nodeOptions}` : nodeOptions`.
   */
  nodeOptions: string;
  close(): void;
}

/**
 * A trailing comment line the shim requires before it injects anything.
 *
 * Two child processes can open the same FIFO at once and split one payload
 * between them. Demanding the terminator turns that race into "this child got
 * nothing" instead of "this child got half the secrets and booted anyway".
 */
const PAYLOAD_END = "#envpilot:end";

const PIPE_NAME = "secrets.pipe";
const SHIM_NAME = "rehydrate.cjs";

/** Grace period before a scratch dir that still has a live pipe is reaped. */
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isHealSupported(): boolean {
  return isPipeSupported();
}

/**
 * Start serving `values` and return the NODE_OPTIONS fragment that rehydrates
 * them. Returns null where FIFOs do not exist (Windows), so the caller can
 * carry on without the shim rather than handle an exception.
 */
export function startHeal(values: Map<string, string>): HealHandle | null {
  if (!isHealSupported()) return null;

  sweepStaleDirs();

  const dir = createSecretsDir();
  let pipe: SecretsPipe | undefined;

  try {
    pipe = serveSecretsPipe({
      dir,
      filename: PIPE_NAME,
      payload: `${toDotenv(values)}${PAYLOAD_END}\n`,
    });

    const shimPath = join(dir, SHIM_NAME);
    writeFileSync(shimPath, shimSource(pipe.path), { mode: 0o600 });

    const served = pipe;
    let closed = false;

    return {
      nodeOptions: `--require ${quoteForNodeOptions(shimPath)}`,
      // Only the pipe goes. Deleting the shim would turn any process that
      // still carries our NODE_OPTIONS into a fatal MODULE_NOT_FOUND, and a
      // detached dev server outliving the CLI is exactly the case heal exists
      // for. Left in place the shim finds no pipe and does nothing; the next
      // run sweeps the directory.
      close(): void {
        if (closed) return;
        closed = true;
        served.close();
      },
    };
  } catch (err) {
    pipe?.close();
    rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

/**
 * Reap scratch directories left by earlier runs.
 *
 * A directory with no pipe belongs to a run that already called close(); one
 * that still has a pipe belongs either to a live run or to a crash, so it is
 * only removed once it is a day old.
 */
function sweepStaleDirs(): void {
  const root = tmpdir();
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith("envpilot-")) continue;
    const dir = join(root, entry);
    try {
      if (!existsSync(join(dir, SHIM_NAME))) continue;
      if (existsSync(join(dir, PIPE_NAME))) {
        if (Date.now() - statSync(dir).mtimeMs < ORPHAN_MAX_AGE_MS) continue;
      }
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Another run owns it, or it vanished mid-sweep. Either way, not ours.
    }
  }
}

/** NODE_OPTIONS is whitespace-split, so a path with spaces needs quoting. */
function quoteForNodeOptions(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path;
}

/**
 * The preload shim, as CommonJS because `--require` cannot load ESM.
 *
 * Two things it must get right. It takes an exclusive lock before touching
 * the pipe, because a FIFO hands its bytes to whichever reader is attached
 * and a monorepo starts many processes at once; without the lock a child can
 * splice the head of one payload onto the tail of the next and inject a
 * truncated value. And everything is wrapped in a catch that swallows: a
 * stale pipe, a lock it never wins or a missing file must never stop the
 * user's server from booting. Worst case the child starts with the
 * environment it already had.
 */
function shimSource(pipePath: string): string {
  return String.raw`/* Envpilot rehydration shim. Holds a pipe path, never a secret value. */
"use strict";
try {
  const fs = require("node:fs");
  const PIPE = ${JSON.stringify(pipePath)};
  const LOCK = PIPE + ".lock";
  const END = ${JSON.stringify(PAYLOAD_END)};

  const pause = function (ms) {
    try {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    } catch (e) {
      /* Atomics unavailable; fall through and spin. */
    }
  };

  // Serialize readers. O_EXCL creation is the lock; a lock older than the
  // read budget belonged to a child that died holding it, so reclaim it.
  const lockDeadline = Date.now() + 3000;
  let held = false;
  while (!held && Date.now() < lockDeadline) {
    try {
      fs.closeSync(fs.openSync(LOCK, "wx"));
      held = true;
    } catch (e) {
      try {
        if (Date.now() - fs.statSync(LOCK).mtimeMs > 5000) fs.unlinkSync(LOCK);
      } catch (e2) {
        /* Someone else reclaimed it first. */
      }
      pause(5);
    }
  }

  if (held) {
    let text = "";
    let fd = -1;
    try {
      fd = fs.openSync(PIPE, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    } catch (e) {
      fd = -1;
    }
    if (fd !== -1) {
      const decoder = new (require("node:string_decoder").StringDecoder)("utf8");
      const buf = Buffer.alloc(65536);
      const TERMINATOR = "\n" + END + "\n";
      // Short budget until the first byte, so a pipe nobody serves anymore
      // costs a fraction of a second. Long budget once data is flowing.
      let deadline = Date.now() + 750;
      let done = false;
      while (!done && Date.now() < deadline) {
        let n = 0;
        try {
          n = fs.readSync(fd, buf, 0, buf.length, null);
        } catch (e) {
          // EAGAIN: a writer is attached but has not filled the buffer yet.
          if (e && e.code === "EAGAIN") { pause(5); continue; }
          break;
        }
        // A zero-length read means no writer holds the pipe. Before any bytes
        // arrive that is just "the CLI has not reopened it yet".
        if (n === 0) {
          if (text.length > 0) { done = true; } else { pause(5); }
          continue;
        }
        if (text.length === 0) deadline = Date.now() + 5000;
        text += decoder.write(buf.subarray(0, n));
        // Stop at the terminator. The CLI re-offers the payload the instant a
        // reader lets go, so waiting for EOF instead would keep pulling copy
        // after copy and hold the lock against every other process.
        const cut = text.indexOf(TERMINATOR);
        if (cut !== -1) {
          text = text.slice(0, cut + TERMINATOR.length);
          done = true;
        }
      }
      try { fs.closeSync(fd); } catch (e) { /* Already closed. */ }
    }
    try { fs.unlinkSync(LOCK); } catch (e) { /* Already reclaimed. */ }

    const lines = text.split("\n");
    // No terminator means the read was cut short. A partial secret set is
    // worse than none, so inject nothing.
    if (lines.indexOf(END) !== -1) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line || line.charCodeAt(0) === 35) continue;
        const eq = line.indexOf("=");
        if (eq < 1) continue;
        const key = line.slice(0, eq);
        let value = line.slice(eq + 1);
        if (
          value.length > 1 &&
          value.charCodeAt(0) === 34 &&
          value.charCodeAt(value.length - 1) === 34
        ) {
          value = value.slice(1, -1).replace(/\\([nrt"\\])/g, function (m, c) {
            return c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c;
          });
        }
        // A value the caller exported deliberately upstream still wins.
        if (process.env[key] === undefined) process.env[key] = value;
      }
    }
  }
} catch (e) {
  /* Secret delivery must never break the process that is booting. */
}
`;
}
