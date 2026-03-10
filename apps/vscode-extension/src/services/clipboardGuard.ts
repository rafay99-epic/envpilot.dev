import * as vscode from "vscode";
import * as path from "path";
import type { ProtectionMode } from "./fileProtection";

/**
 * ClipboardGuardService prevents copying secret values from protected .env files.
 *
 * For non-writable roles (viewer, developer, member), copy and cut operations
 * are blocked in .env files managed by Envpilot. This prevents exfiltration
 * of secret values via the clipboard.
 *
 * Implementation: Overrides the built-in copy/cut commands. For non-protected
 * files, performs the clipboard operation directly via the VS Code clipboard API.
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
   * Get the selected text from an editor (or current line if no selection).
   */
  private getTextToCopy(editor: vscode.TextEditor): string {
    const selections = editor.selections;

    if (selections.length === 1 && selections[0].isEmpty) {
      // No selection — VS Code copies the entire current line (including newline)
      const line = editor.document.lineAt(selections[0].active.line);
      const eol = editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
      return line.text + eol;
    }

    // Copy all selected text (multi-cursor support)
    return selections
      .map((sel) => editor.document.getText(sel))
      .join(editor.document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n");
  }

  /**
   * Handle copy command — block if file is protected, otherwise copy normally.
   */
  private async handleCopy(editor: vscode.TextEditor): Promise<void> {
    if (this.isFileProtected(editor)) {
      vscode.window.showWarningMessage(
        "Envpilot: Copying from protected .env files is not allowed. Secret values are managed securely."
      );
      return;
    }

    // Perform copy directly via clipboard API
    const text = this.getTextToCopy(editor);
    await vscode.env.clipboard.writeText(text);
  }

  /**
   * Handle cut command — block if file is protected, otherwise cut normally.
   */
  private async handleCut(
    editor: vscode.TextEditor,
    edit: vscode.TextEditorEdit
  ): Promise<void> {
    if (this.isFileProtected(editor)) {
      vscode.window.showWarningMessage(
        "Envpilot: Cutting from protected .env files is not allowed. Secret values are managed securely."
      );
      return;
    }

    // Perform cut: copy text then delete selection(s)
    const text = this.getTextToCopy(editor);
    await vscode.env.clipboard.writeText(text);

    const selections = editor.selections;
    if (selections.length === 1 && selections[0].isEmpty) {
      // Cut entire line (VS Code default behavior)
      const line = editor.document.lineAt(selections[0].active.line);
      const range = line.rangeIncludingLineBreak;
      edit.delete(range);
    } else {
      // Delete all selections
      for (const sel of selections) {
        edit.delete(sel);
      }
    }
  }

  private normalizePath(filePath: string): string {
    return path.resolve(filePath).toLowerCase();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    this.protectedFiles.clear();
  }
}
