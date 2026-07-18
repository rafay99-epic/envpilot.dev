import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

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
}

// ponytail: one manifest shared by all VS Code forks (Code/Cursor/VSCodium).
// Uninstalling from one fork purges unmodified files managed by another; the
// surviving install rewrites them on next sync. Per-product manifests if that
// ever bites.
export function getManifestPath(homedir: string = os.homedir()): string {
  return path.join(homedir, ".envpilot", "vscode-managed-files.json");
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export async function readManifest(
  manifestPath: string
): Promise<ManagedFileEntry[]> {
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ManagedFileEntry =>
        typeof e?.path === "string" && typeof e?.sha256 === "string"
    );
  } catch {
    return []; // Missing or corrupt manifest — treat as empty.
  }
}

async function writeManifest(
  manifestPath: string,
  entries: ManagedFileEntry[]
): Promise<void> {
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(entries, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

/** Record (upsert) a file the extension just wrote. Best-effort. */
export async function recordManagedFile(
  filePath: string,
  content: string,
  manifestPath: string = getManifestPath(),
  mode?: ManagedFileEntry["mode"]
): Promise<void> {
  try {
    const resolved = path.resolve(filePath);
    const entries = await readManifest(manifestPath);
    const next = entries.filter((e) => e.path !== resolved);
    next.push({
      path: resolved,
      sha256: hashContent(content),
      ...(mode ? { mode } : {}),
    });
    await writeManifest(manifestPath, next);
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
    const resolvedOld = path.resolve(oldPath);
    const entries = await readManifest(manifestPath);
    const entry = entries.find((e) => e.path === resolvedOld);
    if (!entry) return;
    entry.path = path.resolve(newPath);
    await writeManifest(manifestPath, entries);
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
    const resolved = path.resolve(filePath);
    const entries = await readManifest(manifestPath);
    const next = entries.filter((e) => e.path !== resolved);
    if (next.length === entries.length) return;
    await writeManifest(manifestPath, next);
  } catch {
    // Never let manifest bookkeeping break a delete.
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
 * ponytail: the read-modify-write of the shared manifest is unlocked, so a
 * concurrent writer in another extension host (sync's recordManagedFile, a
 * second window's purge) can be clobbered by a stale `kept` write. The
 * damage is bounded — a lost entry is re-recorded on that project's next
 * sync, and a resurrected entry for a deleted file drops itself on the next
 * purge (readFile fails). Add proper-lockfile if this ever bites for real.
 */
export async function purgeManagedFilesFiltered(
  shouldPurge: (filePath: string) => boolean,
  manifestPath: string = getManifestPath()
): Promise<{ deleted: number; spared: number; failed: number }> {
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
    let content: string;
    try {
      content = await fs.readFile(entry.path, "utf-8");
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
      const content = await fs.readFile(entry.path, "utf-8");
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
