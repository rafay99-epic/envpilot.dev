import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import {
  getManifestPath,
  hashContent,
  readManifest,
} from "../utils/managedFiles";
import { pathKey } from "../utils/paths";
import { captureError } from "../utils/sentry";
import type { ProtectionMode } from "../roles";

interface WatchedFile {
  filePath: string;
  watcher: vscode.FileSystemWatcher;
  resync: () => Promise<void>;
  mode: ProtectionMode;
  restore: { writable: number; readonly: number };
  timer?: NodeJS.Timeout;
}

const DEFAULT_RESTORE = { writable: 0o644, readonly: 0o444 };

export class FileProtectionService {
  private watched = new Map<string, WatchedFile>();
  private syncDepth = 0;

  setSyncing(value: boolean): void {
    this.syncDepth = Math.max(0, this.syncDepth + (value ? 1 : -1));
  }

  watchFile(
    filePath: string,
    resyncCallback: () => Promise<void>,
    mode: ProtectionMode = "readonly-with-request",
    restoreMode?: { writable: number; readonly: number }
  ): void {
    if (mode === "writable") {
      this.unwatchFile(filePath);
      return;
    }

    const key = pathKey(filePath);
    const existing = this.watched.get(key);
    if (existing) {
      existing.resync = resyncCallback;
      existing.mode = mode;
      existing.restore = restoreMode ?? existing.restore;
      return;
    }

    const watcher = vscode.workspace.createFileSystemWatcher(filePath);
    const entry: WatchedFile = {
      filePath,
      watcher,
      resync: resyncCallback,
      mode,
      restore: restoreMode ?? DEFAULT_RESTORE,
    };
    watcher.onDidChange(() => this.scheduleCheck(entry));
    watcher.onDidDelete(() => this.scheduleCheck(entry));
    this.watched.set(key, entry);
  }

  private scheduleCheck(entry: WatchedFile): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      if (this.syncDepth > 0) {
        this.scheduleCheck(entry);
        return;
      }
      void this.handleUnauthorizedEdit(entry).catch(captureError);
    }, 500);
  }

  unwatchFile(filePath: string): void {
    const key = pathKey(filePath);
    const entry = this.watched.get(key);
    if (!entry) return;
    entry.watcher.dispose();
    if (entry.timer) clearTimeout(entry.timer);
    this.watched.delete(key);
  }

  private async handleUnauthorizedEdit(entry: WatchedFile): Promise<void> {
    const { filePath, mode } = entry;
    try {
      const [entries, content] = await Promise.all([
        readManifest(getManifestPath()),
        fs.readFile(filePath),
      ]);
      const resolved = path.resolve(filePath);
      const manifestEntry = entries.find((e) => e.path === resolved);
      if (manifestEntry && hashContent(content) === manifestEntry.sha256) {
        return;
      }
    } catch {}

    this.setSyncing(true);
    try {
      await fs.chmod(filePath, entry.restore.writable).catch(() => {});
      await entry.resync();
    } finally {
      if (this.watched.has(pathKey(filePath))) {
        await fs.chmod(filePath, entry.restore.readonly).catch(() => {});
      }
      this.setSyncing(false);
    }

    if (mode === "strict-readonly") {
      void vscode.window.showWarningMessage(
        "This file is managed by Envpilot. You have viewer access and cannot modify it."
      );
      return;
    }
    void vscode.window
      .showWarningMessage(
        "This file is managed by Envpilot. You cannot edit it directly.",
        "Request Variable"
      )
      .then((action) => {
        if (action === "Request Variable") {
          void vscode.commands.executeCommand("envpilot.requestVariable");
        }
      });
  }

  dispose(): void {
    for (const entry of this.watched.values()) {
      entry.watcher.dispose();
      if (entry.timer) clearTimeout(entry.timer);
    }
    this.watched.clear();
  }
}
