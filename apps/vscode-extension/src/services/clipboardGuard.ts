import * as vscode from "vscode";
import { normalizePath as sharedNormalizePath } from "../utils/paths";
import * as output from "../utils/outputChannel";
import { shouldBlock, type ClipboardGuardScope } from "../utils/clipboardScope";
import type { ProtectionMode } from "./fileProtection";

/**
 * ClipboardGuardService prevents copying secret values from managed .env files.
 *
 * Every managed file is registered here with its protection mode; the
 * "envpilot.clipboardGuard.scope" setting (read live, no reload needed)
 * decides which of them actually block copy/cut:
 * - "all-managed": any managed file, regardless of role
 * - "readonly-roles": only strict-readonly / readonly-with-request files
 * - "off": never block
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
    const overrides: Array<
      [string, Parameters<typeof vscode.commands.registerTextEditorCommand>[1]]
    > = [
      [
        "editor.action.clipboardCopyAction",
        (editor) =>
          void this.handleCopy(editor, "editor.action.clipboardCopyAction"),
      ],
      [
        "editor.action.clipboardCopyWithSyntaxHighlightingAction",
        (editor) =>
          void this.handleCopy(
            editor,
            "editor.action.clipboardCopyWithSyntaxHighlightingAction"
          ),
      ],
      [
        "editor.action.clipboardCutAction",
        (editor, edit) => void this.handleCut(editor, edit),
      ],
    ];

    let failed = false;
    for (const [command, callback] of overrides) {
      // Registration throws if another extension already registered the same
      // command — degrade to a warning instead of failing activation.
      try {
        this.disposables.push(
          vscode.commands.registerTextEditorCommand(command, callback)
        );
      } catch (err) {
        failed = true;
        output.error(
          `Failed to register clipboard override ${command}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (failed) {
      vscode.window.showWarningMessage(
        "Envpilot: Another extension conflicts with clipboard protection. Copying from protected .env files may not be blocked."
      );
    }
  }

  /**
   * Delegate to VS Code's built-in copy/cut command for an unprotected file,
   * so ordinary editing keeps native behavior instead of our reimplementation.
   */
  private async delegateToDefault(command: string): Promise<void> {
    await vscode.commands.executeCommand(`default:${command}`);
  }

  /**
   * Register a managed file with its protection mode. Called for EVERY
   * managed file, including writable ones — the scope setting decides
   * whether a given mode actually blocks.
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
   * Re-key a guarded file after it is renamed/moved so protection follows it.
   */
  handleRename(oldPath: string, newPath: string): void {
    const oldKey = this.normalizePath(oldPath);
    const mode = this.protectedFiles.get(oldKey);
    if (mode === undefined) {
      return;
    }
    this.protectedFiles.delete(oldKey);
    this.protectedFiles.set(this.normalizePath(newPath), mode);
  }

  /**
   * Whether a file is registered in the managed map (any mode).
   */
  isManaged(filePath: string): boolean {
    return this.protectedFiles.has(this.normalizePath(filePath));
  }

  /** Read the scope setting live so changes apply without a reload. */
  private getScope(): ClipboardGuardScope {
    return vscode.workspace
      .getConfiguration("envpilot")
      .get<ClipboardGuardScope>("clipboardGuard.scope", "all-managed");
  }

  /**
   * Check if copy/cut should be blocked for the given editor's file.
   */
  private isFileProtected(editor: vscode.TextEditor): boolean {
    const filePath = this.normalizePath(editor.document.uri.fsPath);
    return shouldBlock(this.getScope(), this.protectedFiles.get(filePath));
  }

  /**
   * Handle copy command — block if file is protected, otherwise delegate to
   * the built-in copy command so unrelated files keep native behavior.
   */
  private async handleCopy(
    editor: vscode.TextEditor,
    command: string
  ): Promise<void> {
    try {
      if (!this.isFileProtected(editor)) {
        await this.delegateToDefault(command);
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
