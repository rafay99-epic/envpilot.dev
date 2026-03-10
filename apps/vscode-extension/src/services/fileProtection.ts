import * as vscode from "vscode";
import * as fs from "fs/promises";

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
  private _isSyncing = false;

  /**
   * Set syncing state to suppress revert during our own writes
   */
  setSyncing(value: boolean): void {
    this._isSyncing = value;
  }

  /**
   * Watch a synced .env file for unauthorized changes.
   * When a change is detected, shows a warning with a "Request Variable" action
   * and reverts the file by calling the resync callback.
   */
  watchFile(
    filePath: string,
    resyncCallback: () => Promise<void>,
    mode: ProtectionMode = "readonly-with-request"
  ): void {
    // Don't create duplicate watchers
    if (this.watchers.has(filePath)) {
      return;
    }

    this.protectionModes.set(filePath, mode);

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(filePath).fsPath, "**")
    );

    // Use a broad pattern and filter by path
    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePath);

    fileWatcher.onDidChange(async () => {
      if (this._isSyncing) {
        return;
      }

      // Debounce to avoid multiple triggers
      const existing = this.debounceTimers.get(filePath);
      if (existing) {
        clearTimeout(existing);
      }

      this.debounceTimers.set(
        filePath,
        setTimeout(async () => {
          this.debounceTimers.delete(filePath);
          await this.handleUnauthorizedEdit(filePath, resyncCallback);
        }, 500)
      );
    });

    // Also handle deletion — if someone deletes a protected file, re-sync it
    fileWatcher.onDidDelete(async () => {
      if (this._isSyncing) {
        return;
      }

      const existing = this.debounceTimers.get(filePath);
      if (existing) {
        clearTimeout(existing);
      }

      this.debounceTimers.set(
        filePath,
        setTimeout(async () => {
          this.debounceTimers.delete(filePath);
          await this.handleUnauthorizedEdit(filePath, resyncCallback);
        }, 500)
      );
    });

    // Clean up the unused broad watcher
    watcher.dispose();

    this.watchers.set(filePath, fileWatcher);
  }

  /**
   * Stop watching a file
   */
  unwatchFile(filePath: string): void {
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
      this._isSyncing = true;

      // Make writable so we can overwrite
      try {
        await fs.chmod(filePath, 0o644);
      } catch {
        // File might not exist
      }

      await resyncCallback();

      // Re-apply read-only
      try {
        await fs.chmod(filePath, 0o444);
      } catch {
        // Ignore
      }
    } finally {
      this._isSyncing = false;
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
