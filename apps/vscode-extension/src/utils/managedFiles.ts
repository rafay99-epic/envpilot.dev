import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { pathsEqual } from "./paths";

export interface ManagedFileEntry {
  path: string;
  sha256: string;
  mode?: "strict-readonly" | "readonly-with-request" | "writable";
  projectIds?: string[];
  lastWriter?: string;
}

export function getManifestPath(homedir: string = os.homedir()): string {
  return path.join(homedir, ".envpilot", "vscode-managed-files.json");
}

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
      const legacy = (e as { projectId?: unknown }).projectId;
      if (typeof legacy === "string" && e.projectIds === undefined) {
        e.projectIds = [legacy];
      }
      if (typeof e.lastWriter !== "string") delete e.lastWriter;
      delete (e as { projectId?: unknown }).projectId;
      if (
        !Array.isArray(e.projectIds) ||
        e.projectIds.some((id) => typeof id !== "string")
      ) {
        delete e.projectIds;
      }
    }
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
    return [];
  }
}

const LOCK_STALE_MS = 10_000;
const LOCK_RENEW_MS = 2_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_WAIT_MS = 60_000;

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

  const now = new Date();
  const heartbeat = setInterval(() => {
    void fs.utimes(lockPath, now, new Date()).catch(() => {});
  }, LOCK_RENEW_MS);
  heartbeat.unref?.();

  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    await fs.unlink(lockPath).catch(() => {});
  }
}

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
      const owners = new Set(previous?.projectIds ?? []);
      if (projectId) owners.add(projectId);

      const next = entries.filter((e) => !pathsEqual(e.path, resolved));
      next.push({
        path: resolved,
        sha256: hashContent(content),
        ...(mode ? { mode } : {}),
        ...(owners.size > 0 ? { projectIds: [...owners] } : {}),
        ...(projectId ? { lastWriter: projectId } : {}),
      });
      await writeManifest(manifestPath, next);
    });
  } catch {}
}

export async function renameManagedFile(
  oldPath: string,
  newPath: string,
  manifestPath: string = getManifestPath()
): Promise<void> {
  try {
    await withManifestLock(manifestPath, async () => {
      const entries = await readManifest(manifestPath);
      const entry = entries.find((e) => pathsEqual(e.path, oldPath));
      if (!entry) return;
      entry.path = path.resolve(newPath);
      await writeManifest(manifestPath, entries);
    });
  } catch {}
}

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
  } catch {}
}

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
    return false;
  }
}

export async function purgeManagedFilesFiltered(
  shouldPurge: (filePath: string) => boolean,
  manifestPath: string = getManifestPath()
): Promise<{ deleted: number; spared: number; failed: number }> {
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
          content = await fs.readFile(entry.path);
        } catch {
          continue;
        }
        if (hashContent(content) !== entry.sha256) {
          spared++;
          kept.push(entry);
          continue;
        }
        try {
          await fs.chmod(entry.path, 0o600);
          await fs.unlink(entry.path);
          deleted++;
        } catch {
          failed++;
          kept.push(entry);
        }
      }
      try {
        await writeManifest(manifestPath, kept);
      } catch {}
      return { deleted, spared, failed };
    });
  } catch {
    return { deleted: 0, spared: 0, failed: 0 };
  }
}

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
        spared++;
        continue;
      }
      await fs.chmod(entry.path, 0o600);
      await fs.unlink(entry.path);
      deleted++;
    } catch {}
  }
  try {
    await fs.unlink(manifestPath);
  } catch {}
  return { deleted, spared };
}
