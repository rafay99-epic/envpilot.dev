import * as vscode from "vscode";
import { pathKey } from "../utils/paths";
import * as output from "../utils/outputChannel";
import { shouldBlock, type ClipboardGuardScope } from "../utils/clipboardScope";
import type { ProtectionMode } from "../roles";

export const CLIPBOARD_BLOCKED_COMMAND = "envpilot.clipboardBlocked";

export class ClipboardGuardService {
  private protectedFiles = new Map<string, ProtectionMode>();
  private disposables: vscode.Disposable[] = [];

  activate(): void {
    this.disposables.push(
      vscode.commands.registerCommand(
        CLIPBOARD_BLOCKED_COMMAND,
        (args?: { action?: "copy" | "cut" }) =>
          void this.handleGuardedKey(args?.action === "cut" ? "cut" : "copy")
      ),
      vscode.window.onDidChangeActiveTextEditor(() => this.syncContextKey()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("envpilot.clipboardGuard.scope")) {
          this.syncContextKey();
        }
      })
    );
    this.syncContextKey();
  }

  protectFile(filePath: string, mode: ProtectionMode): void {
    this.protectedFiles.set(this.normalizePath(filePath), mode);
    this.syncContextKey();
  }

  unprotectFile(filePath: string): void {
    this.protectedFiles.delete(this.normalizePath(filePath));
    this.syncContextKey();
  }

  handleRename(oldPath: string, newPath: string): void {
    const oldKey = this.normalizePath(oldPath);
    const mode = this.protectedFiles.get(oldKey);
    if (mode === undefined) {
      return;
    }
    this.protectedFiles.delete(oldKey);
    this.protectedFiles.set(this.normalizePath(newPath), mode);
    this.syncContextKey();
  }

  isManaged(filePath: string): boolean {
    return this.protectedFiles.has(this.normalizePath(filePath));
  }

  private getScope(): ClipboardGuardScope {
    return vscode.workspace
      .getConfiguration("envpilot")
      .get<ClipboardGuardScope>("clipboardGuard.scope", "all-managed");
  }

  private activeEditorBlocked(): boolean {
    const editor = vscode.window.activeTextEditor;
    const mode = editor
      ? this.protectedFiles.get(this.normalizePath(editor.document.uri.fsPath))
      : undefined;
    return shouldBlock(this.getScope(), mode);
  }

  private syncContextKey(): void {
    void vscode.commands.executeCommand(
      "setContext",
      "envpilot.clipboardBlocked",
      this.activeEditorBlocked()
    );
  }

  private async handleGuardedKey(action: "copy" | "cut"): Promise<void> {
    if (this.activeEditorBlocked()) {
      void vscode.window.showWarningMessage(
        `Envpilot: ${action === "cut" ? "Cutting" : "Copying"} from protected .env files is not allowed. Secret values are managed securely.`
      );
      return;
    }

    this.syncContextKey();
    try {
      await vscode.commands.executeCommand(
        action === "cut"
          ? "editor.action.clipboardCutAction"
          : "editor.action.clipboardCopyAction"
      );
    } catch (err) {
      output.warn(
        `Clipboard ${action} re-dispatch failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private normalizePath(filePath: string): string {
    return pathKey(filePath);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.protectedFiles.clear();
    void vscode.commands.executeCommand(
      "setContext",
      "envpilot.clipboardBlocked",
      false
    );
  }
}
