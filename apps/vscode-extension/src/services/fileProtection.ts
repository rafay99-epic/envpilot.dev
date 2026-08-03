import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getManifestPath,
  hashContent,
  readManifest,
} from "../utils/managedFiles";

export type ProtectionMode =
  | "strict-readonly"
  | "readonly-with-request"
  | "writable";

/**
 * FileProtectionService monitors synced .env files and reverts unauthorized edits.
 * Protection modes:
 * - "strict-readonly": Viewer role — no edits, no request option
 * - "readonly-with-request": Developer/Member role — no edits, but can request changes
 * - "writable": Manager/Team Lead/Admin — full edit access
 */
export class FileProtectionService {
  private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private protectionModes: Map<string, ProtectionMode> = new Map();
  /** Per-file permission bits to restore around a revert (see watchFile). */
  private restoreModes = new Map<
    string,
    { writable: number; readonly: number }
  >();
  /** Depth counter — concurrent sync writes (per-env fan-out) each hold the
   * suppression until their own finally releases it. */
  private syncDepth = 0;

  /**
   * Set syncing state to suppress revert during our own writes
   */
  setSyncing(value: boolean): void {
    this.syncDepth = Math.max(0, this.syncDepth + (value ? 1 : -1));
  }

  private get isSyncing(): boolean {
    return this.syncDepth > 0;
  }

  /**
   * Watch a synced .env file for unauthorized changes.
   * When a change is detected, shows a warning with a "Request Variable" action
   * and reverts the file by calling the resync callback.
   */
  watchFile(
    filePath: string,
    resyncCallback: () => Promise<void>,
    mode: ProtectionMode = "readonly-with-request",
    /**
     * Permission bits to restore around a revert. Omit for .env files, which
     * keep the historical 0644-write / 0444-readonly pair. Secret files pass
     * their own (0600 or 0400): reverting a keystore to 0444 would make it
     * world-readable, which is looser than the mode it was pulled with.
     */
    restoreMode?: { writable: number; readonly: number }
  ): void {
    // Don't create duplicate watchers
    if (this.watchers.has(filePath)) {
      return;
    }

    this.protectionModes.set(filePath, mode);
    if (restoreMode) {
      this.restoreModes.set(filePath, restoreMode);
    }

    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePath);

    fileWatcher.onDidChange(() => this.scheduleCheck(filePath, resyncCallback));
    // Also handle deletion — if someone deletes a protected file, re-sync it
    fileWatcher.onDidDelete(() => this.scheduleCheck(filePath, resyncCallback));

    this.watchers.set(filePath, fileWatcher);
  }

  /**
   * Debounced verification of a watcher event. Events delivered mid-sync are
   * NOT dropped (a genuine external edit can land inside the per-env fan-out
   * window) — the timer re-arms until the sync settles, then the manifest-hash
   * check in handleUnauthorizedEdit suppresses our own writes.
   */
  private scheduleCheck(
    filePath: string,
    resyncCallback: () => Promise<void>
  ): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      filePath,
      setTimeout(async () => {
        this.debounceTimers.delete(filePath);
        if (this.isSyncing) {
          this.scheduleCheck(filePath, resyncCallback);
          return;
        }
        await this.handleUnauthorizedEdit(filePath, resyncCallback);
      }, 500)
    );
  }

  /**
   * Stop watching a file
   */
  unwatchFile(filePath: string): void {
    this.restoreModes.delete(filePath);
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.dispose();
      this.watchers.delete(filePath);
    }

    const timer = this.debounceTimers.get(filePath);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(filePath);
    }

    this.protectionModes.delete(filePath);
  }

  /**
   * Handle an unauthorized edit by showing a warning and reverting
   */
  private async handleUnauthorizedEdit(
    filePath: string,
    resyncCallback: () => Promise<void>
  ): Promise<void> {
    // A watcher event can land after the sync's setSyncing(false) — if the
    // on-disk content still matches the managed-files manifest hash, it was
    // our own write; never warn or revert over it.
    try {
      const [entries, content] = await Promise.all([
        readManifest(getManifestPath()),
        // Bytes, not utf-8 — the manifest hashes raw bytes, and a binary
        // keystore decoded as utf-8 never matches its own recorded hash.
        fs.readFile(filePath),
      ]);
      const resolved = path.resolve(filePath);
      const entry = entries.find((e) => e.path === resolved);
      if (entry && hashContent(content) === entry.sha256) {
        return;
      }
    } catch {
      // Unreadable/deleted file — fall through to the normal revert path.
    }

    const mode = this.protectionModes.get(filePath) || "readonly-with-request";

    let action: string | undefined;
    if (mode === "strict-readonly") {
      action = await vscode.window.showWarningMessage(
        "This file is managed by Envpilot. You have viewer access and cannot modify it.",
        "OK"
      );
    } else {
      action = await vscode.window.showWarningMessage(
        "This file is managed by Envpilot. You cannot edit it directly.",
        "Request Variable",
        "OK"
      );
    }

    // Revert the file regardless of which button was clicked
    try {
      this.setSyncing(true);

      const restore = this.restoreModes.get(filePath) ?? {
        writable: 0o644,
        readonly: 0o444,
      };

      // Make writable so we can overwrite
      try {
        await fs.chmod(filePath, restore.writable);
      } catch {
        // File might not exist
      }

      await resyncCallback();

      // Re-apply read-only
      try {
        await fs.chmod(filePath, restore.readonly);
      } catch {
        // Ignore
      }
    } finally {
      this.setSyncing(false);
    }

    if (action === "Request Variable") {
      await vscode.commands.executeCommand("envpilot.requestVariable");
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.protectionModes.clear();
  }
}
