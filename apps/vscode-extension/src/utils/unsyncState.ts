import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

/**
 * Local state for unsync-on-close, stored under ~/.envpilot next to the
 * managed-files manifest (see managedFiles.ts for why it lives outside VS
 * Code's storage). Two concerns, both best-effort — a failure here must never
 * break activation or deactivation:
 *
 * 1. SESSION MARKERS (~/.envpilot/vscode-sessions/<pid>): one file per live
 *    extension host, written on activate and removed on clean deactivate.
 *    A marker whose pid is no longer running means that session crashed or
 *    was force-killed before deactivate() could purge — the next activation
 *    detects this and runs a crash sweep.
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

/** Record this extension host as live. Best-effort. */
export async function writeSessionMarker(
  pid: number,
  sessionsDir: string = getSessionsDir()
): Promise<void> {
  try {
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.writeFile(path.join(sessionsDir, String(pid)), "", {
      mode: 0o600,
    });
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
 * Remove markers of dead extension hosts and report whether any existed —
 * true means at least one prior session ended without a clean deactivate
 * (crash, force-quit, power loss) and a crash sweep is warranted.
 */
export async function reapDeadSessionMarkers(
  sessionsDir: string = getSessionsDir(),
  isPidAlive: (pid: number) => boolean = defaultIsPidAlive
): Promise<boolean> {
  let foundDead = false;
  try {
    const names = await fs.readdir(sessionsDir);
    for (const name of names) {
      const pid = Number(name);
      if (!Number.isInteger(pid) || pid <= 0 || !isPidAlive(pid)) {
        foundDead = true;
        try {
          await fs.unlink(path.join(sessionsDir, name));
        } catch {
          // Already reaped by a concurrent window.
        }
      }
    }
  } catch {
    // Missing dir = no prior sessions.
  }
  return foundDead;
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
