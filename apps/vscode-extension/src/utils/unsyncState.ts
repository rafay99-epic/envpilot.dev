import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

export interface UnsyncReport {
  projectId: string;
  deletedCount: number;
  sparedCount: number;
  trigger: "close" | "crash-sweep";
  occurredAt: number;
}

export function getSessionsDir(homedir: string = os.homedir()): string {
  return path.join(homedir, ".envpilot", "vscode-sessions");
}

export function getReportsPath(homedir: string = os.homedir()): string {
  return path.join(homedir, ".envpilot", "vscode-unsync-reports.json");
}

function defaultIsPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function isPidName(name: string): boolean {
  return /^[0-9]+$/.test(name);
}

async function readMarkerFolders(markerPath: string): Promise<string[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(markerPath, "utf-8"));
    const folders = parsed?.folders;
    if (!Array.isArray(folders)) return [];
    return folders.filter((f): f is string => typeof f === "string");
  } catch {
    return [];
  }
}

export async function writeSessionMarker(
  pid: number,
  folders: string[],
  sessionsDir: string = getSessionsDir()
): Promise<void> {
  try {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(
      path.join(sessionsDir, String(pid)),
      JSON.stringify({ folders }),
      { mode: 0o600 }
    );
  } catch {}
}

export async function clearSessionMarker(
  pid: number,
  sessionsDir: string = getSessionsDir()
): Promise<void> {
  try {
    await fs.unlink(path.join(sessionsDir, String(pid)));
  } catch {}
}

export async function reapDeadSessionMarkers(
  sessionsDir: string = getSessionsDir(),
  isPidAlive: (pid: number) => boolean = defaultIsPidAlive
): Promise<{ crashed: boolean; deadFolders: string[] }> {
  let crashed = false;
  const deadFolders: string[] = [];
  try {
    const names = await fs.readdir(sessionsDir);
    for (const name of names) {
      if (!isPidName(name)) continue;
      const pid = Number(name);
      if (isPidAlive(pid)) continue;
      crashed = true;
      const markerPath = path.join(sessionsDir, name);
      deadFolders.push(...(await readMarkerFolders(markerPath)));
      try {
        await fs.unlink(markerPath);
      } catch {}
    }
  } catch {}
  return { crashed, deadFolders };
}

export async function getLiveSessionFolders(
  excludePid: number,
  sessionsDir: string = getSessionsDir(),
  isPidAlive: (pid: number) => boolean = defaultIsPidAlive
): Promise<string[]> {
  const folders: string[] = [];
  try {
    const names = await fs.readdir(sessionsDir);
    for (const name of names) {
      if (!isPidName(name)) continue;
      const pid = Number(name);
      if (pid === excludePid || !isPidAlive(pid)) continue;
      folders.push(...(await readMarkerFolders(path.join(sessionsDir, name))));
    }
  } catch {}
  return folders;
}

export async function appendUnsyncReport(
  report: UnsyncReport,
  reportsPath: string = getReportsPath()
): Promise<void> {
  try {
    const existing = await readReports(reportsPath);
    existing.push(report);
    await fs.mkdir(path.dirname(reportsPath), { recursive: true });
    await fs.writeFile(reportsPath, JSON.stringify(existing), {
      encoding: "utf-8",
      mode: 0o600,
    });
  } catch {}
}

export async function drainUnsyncReports(
  send: (reports: UnsyncReport[]) => Promise<void>,
  reportsPath: string = getReportsPath()
): Promise<void> {
  const claimPath = `${reportsPath}.${process.pid}`;
  try {
    await fs.rename(reportsPath, claimPath);
  } catch {
    return;
  }
  const reports = await readReports(claimPath);
  try {
    if (reports.length > 0) await send(reports);
  } catch (err) {
    for (const report of reports) await appendUnsyncReport(report, reportsPath);
    throw err;
  } finally {
    await fs.rm(claimPath, { force: true });
  }
}

async function readReports(reportsPath: string): Promise<UnsyncReport[]> {
  try {
    const raw = await fs.readFile(reportsPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is UnsyncReport =>
        typeof r?.projectId === "string" &&
        typeof r?.deletedCount === "number" &&
        typeof r?.sparedCount === "number" &&
        (r?.trigger === "close" || r?.trigger === "crash-sweep") &&
        typeof r?.occurredAt === "number"
    );
  } catch {
    return [];
  }
}
