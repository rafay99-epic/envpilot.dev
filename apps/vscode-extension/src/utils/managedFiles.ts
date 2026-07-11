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
  manifestPath: string = getManifestPath()
): Promise<void> {
  try {
    const resolved = path.resolve(filePath);
    const entries = await readManifest(manifestPath);
    const next = entries.filter((e) => e.path !== resolved);
    next.push({ path: resolved, sha256: hashContent(content) });
    await writeManifest(manifestPath, next);
  } catch {
    // Never let manifest bookkeeping break a sync.
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
