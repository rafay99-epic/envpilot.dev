import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * Local state for unsync-on-close, stored under ~/.envpilot next to the
 * managed-files manifest (see managedFiles.ts for why it lives outside VS
 * Code's storage). Two concerns, both best-effort — a failure here must never
 * break activation or deactivation:
 *
 * 1. SESSION MARKERS (~/.envpilot/vscode-sessions/<pid>): one JSON file per
 *    live extension host, written on activate and removed on clean
 *    deactivate. The file records the session's workspace folders so that
 *    (a) a crash sweep can target the CRASHED session's folders, whatever
 *    workspace the next activation opens, and (b) a closing window can spare
 *    files that another still-live window is using. A marker whose pid is no
 *    longer running means that session crashed or was force-killed before
 *    deactivate() could purge.
 *
 *    PID liveness is a heuristic: a recycled pid makes a dead session look
 *    alive, so its sweep is skipped until that pid dies too. Rare, and it
 *    fails toward NOT deleting — acceptable.
 *
 * 2. PENDING UNSYNC REPORTS (~/.envpilot/vscode-unsync-reports.json): purge
 *    summaries (counts only — never paths or values) queued at shutdown,
 *    where network calls are unreliable, and drained/sent on the next
 *    activation for the server-side audit trail.
 *
 * This module must stay free of vscode imports so it stays unit-testable.
 */

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

/** A pid is alive if signal 0 is deliverable (EPERM = alive, not ours). */
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
    return []; // Legacy empty marker or corrupt JSON — no folder info.
  }
}

/** Record this extension host (and its workspace folders) as live. */
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
  } catch {
    // Never block activation.
  }
}

/** Remove this extension host's marker on clean shutdown. Best-effort. */
export async function clearSessionMarker(
  pid: number,
  sessionsDir: string = getSessionsDir()
): Promise<void> {
  try {
    await fs.unlink(path.join(sessionsDir, String(pid)));
  } catch {
    // Missing marker is fine.
  }
}

/**
 * Remove markers of dead extension hosts and return their recorded workspace
 * folders — a non-empty `crashed` means at least one prior session ended
 * without a clean deactivate (crash, force-quit, power loss) and a crash
 * sweep over `deadFolders` is warranted. Non-pid filenames (.DS_Store and
 * friends) are ignored entirely — they are not session markers.
 */
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
      } catch {
        // Already reaped by a concurrent window.
      }
    }
  } catch {
    // Missing dir = no prior sessions.
  }
  return { crashed, deadFolders };
}

/**
 * Workspace folders of OTHER live extension hosts. A closing window must
 * never purge files that a still-running window is using — its purge
 * excludes anything under these folders.
 */
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
  } catch {
    // Missing dir = no other sessions.
  }
  return folders;
}

/** Queue a purge summary for the next-activation audit report. Best-effort. */
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
  } catch {
    // Losing a counts-only report is acceptable; breaking shutdown is not.
  }
}

/**
 * Take all queued reports, removing the file. Returns [] when there is
 * nothing to send. Callers own delivery; a failed send loses the batch
 * (counts-only telemetry — not worth retry machinery).
 */
export async function drainUnsyncReports(
  reportsPath: string = getReportsPath()
): Promise<UnsyncReport[]> {
  const reports = await readReports(reportsPath);
  try {
    await fs.unlink(reportsPath);
  } catch {
    // Missing file is fine.
  }
  return reports;
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
