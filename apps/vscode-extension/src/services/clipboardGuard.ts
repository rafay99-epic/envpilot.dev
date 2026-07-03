import * as vscode from "vscode";
import { normalizePath as sharedNormalizePath } from "../utils/paths";
import * as output from "../utils/outputChannel";
import type { ProtectionMode } from "./fileProtection";

/**
 * ClipboardGuardService prevents copying secret values from protected .env files.
 *
 * For non-writable roles (viewer, developer, member), copy and cut operations
 * are blocked in .env files managed by Envpilot. This prevents exfiltration
 * of secret values via the clipboard.
 *
 * Implementation: Overrides the built-in copy/cut commands, but only runs the
 * custom guard logic for protected files. For every other file, the override
 * delegates straight back to VS Code's built-in `default:` command so normal
 * editing keeps native copy/cut semantics (box selection, HTML clipboard
 * payloads, notebook cells, diff editor, etc.).
 */
export class ClipboardGuardService {
  private protectedFiles = new Map<string, ProtectionMode>();
  private disposables: vscode.Disposable[] = [];

  /**
   * Register clipboard interception for protected .env files.
   * Must be called during extension activation.
   */
  activate(): void {
    // Override the built-in copy command
    this.disposables.push(
      vscode.commands.registerTextEditorCommand(
        "editor.action.clipboardCopyAction",
        (editor) => this.handleCopy(editor)
      )
    );

    // Override the built-in cut command
    this.disposables.push(
      vscode.commands.registerTextEditorCommand(
        "editor.action.clipboardCutAction",
        (editor, edit) => this.handleCut(editor, edit)
      )
    );
  }

  /**
   * Delegate to VS Code's built-in copy/cut command for an unprotected file,
   * so ordinary editing keeps native behavior instead of our reimplementation.
   */
  private async delegateToDefault(command: string): Promise<void> {
    await vscode.commands.executeCommand(`default:${command}`);
  }

  /**
   * Mark a file as protected with a specific mode.
   */
  protectFile(filePath: string, mode: ProtectionMode): void {
    this.protectedFiles.set(this.normalizePath(filePath), mode);
  }

  /**
   * Remove protection from a file.
   */
  unprotectFile(filePath: string): void {
    this.protectedFiles.delete(this.normalizePath(filePath));
  }

  /**
   * Check if the given editor is showing a protected (non-writable) .env file.
   */
  private isFileProtected(editor: vscode.TextEditor): boolean {
    const filePath = this.normalizePath(editor.document.uri.fsPath);
    const mode = this.protectedFiles.get(filePath);
    return mode === "strict-readonly" || mode === "readonly-with-request";
  }

  /**
   * Handle copy command — block if file is protected, otherwise delegate to
   * the built-in copy command so unrelated files keep native behavior.
   */
  private async handleCopy(editor: vscode.TextEditor): Promise<void> {
    try {
      if (!this.isFileProtected(editor)) {
        await this.delegateToDefault("editor.action.clipboardCopyAction");
        return;
      }

      vscode.window.showWarningMessage(
        "Envpilot: Copying from protected .env files is not allowed. Secret values are managed securely."
      );
    } catch (err) {
      // A clipboard/command API failure should degrade gracefully rather
      // than surfacing a confusing error on an otherwise-normal file.
      output.warn(
        `Clipboard copy failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Handle cut command — block if file is protected, otherwise delegate to
   * the built-in cut command so unrelated files keep native behavior.
   */
  private async handleCut(
    editor: vscode.TextEditor,
    // The built-in cut command is delegated to for unprotected files, so the
    // edit builder VS Code supplies for this text-editor command is unused —
    // kept to satisfy the `registerTextEditorCommand` callback signature.
    _edit: vscode.TextEditorEdit
  ): Promise<void> {
    try {
      if (!this.isFileProtected(editor)) {
        await this.delegateToDefault("editor.action.clipboardCutAction");
        return;
      }

      vscode.window.showWarningMessage(
        "Envpilot: Cutting from protected .env files is not allowed. Secret values are managed securely."
      );
    } catch (err) {
      // A clipboard/command API failure should degrade gracefully rather
      // than surfacing a confusing error on an otherwise-normal file.
      output.warn(
        `Clipboard cut failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private normalizePath(filePath: string): string {
    return sharedNormalizePath(filePath);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.protectedFiles.clear();
  }
}
