import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { pathsEqual } from "./paths";

/**
 * Persistent manifest of every .env file this extension has written, so the
 * `vscode:uninstall` hook (src/uninstall.ts) can purge synced secrets from
 * disk after the extension is removed. The hook runs as a plain node script
 * with no vscode API, so the manifest must live at a deterministic path
 * OUTSIDE VS Code's storage: ~/.envpilot/vscode-managed-files.json.
 *
 * The manifest stores only { path, sha256-of-last-written-content } — never
 * secret values. The hash is the data-loss guard: the uninstall hook deletes
 * a file ONLY if its on-disk content still matches what the extension last
 * wrote. Hand-edited files are always spared (see the deactivate() comment in
 * extension.ts for the incident that makes this non-negotiable).
 *
 * Every write here is best-effort: manifest bookkeeping must never break a
 * sync. This module must stay free of vscode imports so uninstall.ts can
 * bundle it.
 */

export interface ManagedFileEntry {
  path: string;
  sha256: string;
  /**
   * Protection mode at write time — lets activation re-arm the clipboard
   * guard before the first sync. Optional: older manifests (and entries the
   * uninstall hook reads) simply lack it. Type is inlined so this module
   * stays vscode-free for the uninstall bundle.
   */
  mode?: "strict-readonly" | "readonly-with-request" | "writable";
  /**
   * Every project that has materialised this file, when known.
   *
   * A LIST, not a single id. Cleanup is per-directory, but two projects can
   * be linked to the SAME directory and legitimately publish the same
   * relative path — unlinking one used to delete a file the other still
   * needs. With a single field the last sync simply overwrote the owner, so
   * which project "owned" the file was a race.
   *
   * Optional: `.env` entries and older manifests lack it and are treated as
   * unowned (the previous directory-scoped behaviour).
   */
  projectIds?: string[];
  /**
   * The project whose bytes are CURRENTLY on disk at this path.
   *
   * Ownership alone is not enough when two projects publish the same path
   * with different content: the file holds whatever the last sync wrote. If
   * that project is then unlinked, "another owner remains" would keep its
   * secret sitting on disk after revocation — the exact leak the ownership
   * work exists to prevent. Recording the writer lets release tell the two
   * cases apart.
   */
  lastWriter?: string;
}

// ponytail: one manifest shared by all VS Code forks (Code/Cursor/VSCodium).
// Uninstalling from one fork purges unmodified files managed by another; the
// surviving install rewrites them on next sync. Per-product manifests if that
// ever bites.
export function getManifestPath(homedir: string = os.homedir()): string {
  return path.join(homedir, ".envpilot", "vscode-managed-files.json");
}

/**
 * Hash the EXACT bytes, never a decoded string.
 *
 * A binary keystore read as utf-8 aliases every invalid sequence to U+FFFD,
 * so two different files hash the same — which let a locally-modified binary
 * secret be deleted as "unchanged" during unsync or uninstall. Passing a
 * string still hashes its utf-8 encoding, so existing .env entries are
 * unaffected.
 */
export function hashContent(content: string | Buffer): string {
  return typeof content === "string"
    ? createHash("sha256").update(content, "utf-8").digest("hex")
    : createHash("sha256").update(content).digest("hex");
}

export async function readManifest(
  manifestPath: string
): Promise<ManagedFileEntry[]> {
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.filter(
      (e): e is ManagedFileEntry =>
        typeof e?.path === "string" && typeof e?.sha256 === "string"
    );
    for (const e of entries) {
      // Migrate the single-owner shape written by earlier builds.
      const legacy = (e as { projectId?: unknown }).projectId;
      if (typeof legacy === "string" && e.projectIds === undefined) {
        e.projectIds = [legacy];
      }
      if (typeof e.lastWriter !== "string") delete e.lastWriter;
      delete (e as { projectId?: unknown }).projectId;
      // A malformed list (version skew, hand-edited manifest) is dropped so
      // ownership checks fall back to unowned rather than throwing.
      if (
        !Array.isArray(e.projectIds) ||
        e.projectIds.some((id) => typeof id !== "string")
      ) {
        delete e.projectIds;
      }
    }
    // Unknown modes (version skew, hand-edited manifest) become undefined so
    // consumers' `?? "readonly-with-request"` fallbacks fail closed.
    for (const e of entries) {
      if (
        e.mode !== "strict-readonly" &&
        e.mode !== "readonly-with-request" &&
        e.mode !== "writable"
      ) {
        delete e.mode;
      }
    }
    return entries;
  } catch {
    return []; // Missing or corrupt manifest — treat as empty.
  }
}

/**
 * A lock is presumed abandoned only after this long WITHOUT a heartbeat. The
 * holder refreshes it every LOCK_RENEW_MS, so a long-running purge is never
 * mistaken for a crashed one no matter how many files it touches.
 */
const LOCK_STALE_MS = 10_000;
const LOCK_RENEW_MS = 2_000;
const LOCK_RETRY_MS = 25;
/** Total time a waiter will queue before giving up. */
const LOCK_MAX_WAIT_MS = 60_000;

/**
 * Cross-PROCESS mutual exclusion on the manifest.
 *
 * The manifest is shared by every VS Code fork and window on the machine, so
 * the in-process chain below is not enough: two extension hosts could each
 * read the same snapshot and write back a version missing the other's
 * change. A lost writer means either a revoked project's secret stays on
 * disk or a file another project still needs gets deleted.
 *
 * Two rules make that safe rather than merely likely-safe:
 *
 *   1. A waiter WAITS. It never proceeds unlocked on timeout — running the
 *      critical section without the lock is the exact race the lock exists
 *      to prevent, and every caller already treats a thrown lock error as
 *      "changed nothing" (recordManagedFile swallows it, releaseManagedFile
 *      answers "do not delete").
 *   2. The holder RENEWS. purgeManagedFilesFiltered holds the lock across
 *      per-file chmod+unlink, which on a large workspace easily outlives a
 *      fixed staleness window — without a heartbeat another host would
 *      break a live lock and both would write.
 *
 * ponytail: an O_EXCL lockfile with a heartbeat, not a lockfile dependency.
 * The uncontended path is one open + one unlink.
 */
async function withFileLock<T>(
  manifestPath: string,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = `${manifestPath}.lock`;
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      // Break a lock only when its heartbeat has stopped — a crashed or
      // killed host — never merely because it is taking a while.
      const age = await fs
        .stat(lockPath)
        .then((s) => Date.now() - s.mtimeMs)
        .catch(() => 0);
      if (age > LOCK_STALE_MS) {
        await fs.unlink(lockPath).catch(() => {});
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for the managed-file manifest lock");
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }

  // Heartbeat: keep proving this holder is alive for as long as it works.
  const now = new Date();
  const heartbeat = setInterval(() => {
    void fs.utimes(lockPath, now, new Date()).catch(() => {});
  }, LOCK_RENEW_MS);
  // Never hold the event loop open on the heartbeat alone — the uninstall
  // hook is a short-lived script and must be able to exit.
  heartbeat.unref?.();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await fs.unlink(lockPath).catch(() => {});
  }
}

/**
 * Serializes every read-modify-write of the manifest: the promise chain
 * covers parallel writers inside THIS process (per-env sync fan-out, rename
 * events), the lockfile covers other extension hosts.
 */
let manifestChain: Promise<unknown> = Promise.resolve();
function withManifestLock<T>(
  manifestPath: string,
  fn: () => Promise<T>
): Promise<T> {
  const run = () => withFileLock(manifestPath, fn);
  const p = manifestChain.then(run, run);
  manifestChain = p.catch(() => {});
  return p;
}

async function writeManifest(
  manifestPath: string,
  entries: ManagedFileEntry[]
): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  // Atomic: write a temp sibling, rename over the target — a concurrent
  // readManifest must never observe truncated JSON.
  const tmpPath = `${manifestPath}.tmp`;
  try {
    await fs.writeFile(tmpPath, JSON.stringify(entries, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    await fs.rename(tmpPath, manifestPath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

/** Record (upsert) a file the extension just wrote. Best-effort. */
export async function recordManagedFile(
  filePath: string,
  content: string | Buffer,
  manifestPath: string = getManifestPath(),
  mode?: ManagedFileEntry["mode"],
  projectId?: string
): Promise<void> {
  try {
    await withManifestLock(manifestPath, async () => {
      const resolved = path.resolve(filePath);
      const entries = await readManifest(manifestPath);
      const previous = entries.find((e) => pathsEqual(e.path, resolved));
      // UNION the owners, never replace them. Overwriting meant the last
      // project to sync became the sole owner, and unlinking it deleted a
      // file another linked project was still using.
      const owners = new Set(previous?.projectIds ?? []);
      if (projectId) owners.add(projectId);

      const next = entries.filter((e) => !pathsEqual(e.path, resolved));
      next.push({
        path: resolved,
        sha256: hashContent(content),
        ...(mode ? { mode } : {}),
        ...(owners.size > 0 ? { projectIds: [...owners] } : {}),
        // These bytes are ours until someone else overwrites them.
        ...(projectId ? { lastWriter: projectId } : {}),
      });
      await writeManifest(manifestPath, next);
    });
  } catch {
    // Never let manifest bookkeeping break a sync.
  }
}

/**
 * Re-key a manifest entry after a rename/move (keeps sha256/mode) so
 * protection, purge, and release still find the file. Best-effort.
 */
export async function renameManagedFile(
  oldPath: string,
  newPath: string,
  manifestPath: string = getManifestPath()
): Promise<void> {
  try {
    await withManifestLock(manifestPath, async () => {
      const entries = await readManifest(manifestPath);
      // pathsEqual (not string equality): the persisted spelling may differ
      // in casing or symlink form from the rename event's path.
      const entry = entries.find((e) => pathsEqual(e.path, oldPath));
      if (!entry) return;
      entry.path = path.resolve(newPath);
      await writeManifest(manifestPath, entries);
    });
  } catch {
    // Never let manifest bookkeeping break a rename.
  }
}

/** Drop a file the extension deliberately deleted. Best-effort. */
export async function forgetManagedFile(
  filePath: string,
  manifestPath: string = getManifestPath()
): Promise<void> {
  try {
    await withManifestLock(manifestPath, async () => {
      const entries = await readManifest(manifestPath);
      const next = entries.filter((e) => !pathsEqual(e.path, filePath));
      if (next.length === entries.length) return;
      await writeManifest(manifestPath, next);
    });
  } catch {
    // Never let manifest bookkeeping break a delete.
  }
}

/**
 * Drop ONE project's claim on a managed file.
 *
 * Returns true when that was the last claim and the file may be deleted;
 * false when another linked project still materialises this same path into
 * the same directory, in which case the file must be left alone. Entries
 * with no recorded owner report true (the pre-ownership behaviour).
 */
export async function releaseManagedFile(
  filePath: string,
  projectId: string,
  manifestPath: string = getManifestPath()
): Promise<boolean> {
  try {
    return await withManifestLock(manifestPath, async () => {
      const entries = await readManifest(manifestPath);
      const entry = entries.find((e) => pathsEqual(e.path, filePath));
      if (!entry) return true;

      const owners = entry.projectIds ?? [];
      const remaining = owners.filter((id) => id !== projectId);
      if (owners.length > 0 && remaining.length > 0) {
        // Another project still publishes this path — but the BYTES on disk
        // may be the departing project's. Keeping them would leave a revoked
        // project's secret readable; deleting is safe because a remaining
        // owner's next sync sees "missing" and re-materialises its own copy.
        const holdsOurBytes = entry.lastWriter === projectId;
        entry.projectIds = remaining;
        if (holdsOurBytes) delete entry.lastWriter;
        await writeManifest(manifestPath, entries);
        return holdsOurBytes;
      }

      await writeManifest(
        manifestPath,
        entries.filter((e) => !pathsEqual(e.path, filePath))
      );
      return true;
    });
  } catch {
    // Bookkeeping must never break cleanup — but do NOT report "safe to
    // delete" off the back of a failure we could not read.
    return false;
  }
}

/**
 * Purge the manifest-listed files selected by `shouldPurge` whose on-disk
 * content still matches the last-synced hash. Hand-edited files (hash
 * mismatch) are ALWAYS spared — the sha256 guard is the non-negotiable
 * data-loss protection (see deactivate() in extension.ts). Unlike
 * purgeManagedFiles, the manifest survives: deleted files are forgotten,
 * spared/unselected/failed entries are kept. Never throws; returns counts.
 *
 * Used by unsync-on-close (deactivate + crash sweep), where only files for
 * opted-in projects under the closing window's workspace may be removed.
 *
 * ponytail: in-process writers are serialized via withManifestLock; only a
 * concurrent writer in ANOTHER extension host (a second window's sync or
 * purge) can still be clobbered by a stale `kept` write. The damage is
 * bounded — a lost entry is re-recorded on that project's next sync, and a
 * resurrected entry for a deleted file drops itself on the next purge
 * (readFile fails). Add proper-lockfile if this ever bites for real.
 */
export async function purgeManagedFilesFiltered(
  shouldPurge: (filePath: string) => boolean,
  manifestPath: string = getManifestPath()
): Promise<{ deleted: number; spared: number; failed: number }> {
  // The lock can now time out rather than silently proceeding unlocked, and
  // this function documents that it never throws — deactivate() calls it on
  // the way out, where an exception surfaces as a VS Code error toast.
  // Reporting "purged nothing" is the correct answer when we could not take
  // the lock: the files stay, and the next run retries.
  try {
    return await withManifestLock(manifestPath, async () => {
      let deleted = 0;
      let spared = 0;
      let failed = 0;
      const entries = await readManifest(manifestPath);
      const kept: ManagedFileEntry[] = [];
      for (const entry of entries) {
        if (!shouldPurge(entry.path)) {
          kept.push(entry);
          continue;
        }
        let content: Buffer;
        try {
          // Bytes, not utf-8: see hashContent.
          content = await fs.readFile(entry.path);
        } catch {
          // Already gone — drop the stale manifest entry.
          continue;
        }
        if (hashContent(content) !== entry.sha256) {
          spared++; // Hand-edited since last sync — never delete user data.
          kept.push(entry);
          continue;
        }
        try {
          // Synced files are often chmod 0o444 by file protection.
          await fs.chmod(entry.path, 0o644);
          await fs.unlink(entry.path);
          deleted++;
        } catch {
          failed++;
          kept.push(entry); // Keep the entry so a later purge can retry.
        }
      }
      try {
        await writeManifest(manifestPath, kept);
      } catch {
        // Manifest bookkeeping must never break a purge.
      }
      return { deleted, spared, failed };
    });
  } catch {
    return { deleted: 0, spared: 0, failed: 0 };
  }
}

/**
 * Purge every manifest-listed file whose on-disk content still matches the
 * last-synced hash, then remove the manifest itself. Hand-edited files
 * (hash mismatch) are left in place. Never throws — this runs during the
 * uninstall hook where a failure would surface as a VS Code startup error.
 * Returns counts for testability.
 */
export async function purgeManagedFiles(
  manifestPath: string = getManifestPath()
): Promise<{ deleted: number; spared: number }> {
  let deleted = 0;
  let spared = 0;
  const entries = await readManifest(manifestPath);
  for (const entry of entries) {
    try {
      const content = await fs.readFile(entry.path);
      if (hashContent(content) !== entry.sha256) {
        spared++; // Hand-edited since last sync — never delete user data.
        continue;
      }
      // Synced files are often chmod 0o444 by file protection.
      await fs.chmod(entry.path, 0o644);
      await fs.unlink(entry.path);
      deleted++;
    } catch {
      // Already gone or unreadable — nothing to purge.
    }
  }
  try {
    await fs.unlink(manifestPath);
  } catch {
    // Missing manifest is fine.
  }
  return { deleted, spared };
}
