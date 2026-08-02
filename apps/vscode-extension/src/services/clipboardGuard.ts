import * as vscode from "vscode";
import { pathKey } from "../utils/paths";
import { shouldBlock, type ClipboardGuardScope } from "../utils/clipboardScope";
import type { ProtectionMode } from "./fileProtection";

/** Command the guarded keybindings point at. Never invoked directly. */
export const CLIPBOARD_BLOCKED_COMMAND = "envpilot.clipboardBlocked";

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
 * Implementation: the `envpilot.clipboardBlocked` context key is kept in sync
 * with "is the active editor a protected file". Keybindings contributed in
 * package.json bind cmd/ctrl+C and cmd/ctrl+X to CLIPBOARD_BLOCKED_COMMAND
 * under `when: editorTextFocus && envpilot.clipboardBlocked`, so outside a
 * protected file VS Code never routes a keystroke to this extension at all.
 *
 * INVARIANT — never register, override, or shadow the built-in clipboard
 * commands (`editor.action.clipboardCopyAction` & co.), not even temporarily.
 * Two prior designs did and both killed copy editor-wide: a global override
 * delegating unprotected files to `default:<command>` (silent async failure),
 * then a focus-scoped override relying on dispose() to restore the built-in
 * (not honored on Cursor, a VS Code fork — the built-in stayed dead after the
 * first protected file was focused). The keybinding layer is the only
 * interception; if the context key ever goes stale, the handler below fails
 * OPEN by re-dispatching the real copy/cut, so the worst possible bug is one
 * warning toast too many in a .env file — never a broken editor.
 *
 * Known bypass, accepted: context-menu Copy and the Edit menu invoke the
 * built-in command directly and are not intercepted. The guard is a nudge
 * against accidental clipboard exposure, not a security boundary — the file
 * is plaintext on disk and readable by any other tool anyway.
 */
export class ClipboardGuardService {
  private protectedFiles = new Map<string, ProtectionMode>();
  private disposables: vscode.Disposable[] = [];

  /**
   * Register the guard. Must be called during extension activation.
   */
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

  /**
   * Register a managed file with its protection mode. Called for EVERY
   * managed file, including writable ones — the scope setting decides
   * whether a given mode actually blocks.
   */
  protectFile(filePath: string, mode: ProtectionMode): void {
    this.protectedFiles.set(this.normalizePath(filePath), mode);
    this.syncContextKey();
  }

  /**
   * Remove protection from a file.
   */
  unprotectFile(filePath: string): void {
    this.protectedFiles.delete(this.normalizePath(filePath));
    this.syncContextKey();
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
    this.syncContextKey();
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

  /** Whether the active editor's file should block copy/cut right now. */
  private activeEditorBlocked(): boolean {
    const editor = vscode.window.activeTextEditor;
    const mode = editor
      ? this.protectedFiles.get(this.normalizePath(editor.document.uri.fsPath))
      : undefined;
    return shouldBlock(this.getScope(), mode);
  }

  /**
   * Publish the block state of the active editor as the context key the
   * package.json keybindings' `when` clause reads. Idempotent — called on
   * every editor change, setting change, and protect/unprotect.
   */
  private syncContextKey(): void {
    void vscode.commands.executeCommand(
      "setContext",
      "envpilot.clipboardBlocked",
      this.activeEditorBlocked()
    );
  }

  /**
   * A guarded keystroke landed. Re-verify against live state instead of
   * trusting the context key: if the file really blocks, warn; if the key was
   * stale, repair it and re-dispatch the REAL copy/cut so the user's
   * keystroke is never swallowed. Safe to dispatch directly — the built-in
   * command is never overridden, so there is no recursion.
   */
  private async handleGuardedKey(action: "copy" | "cut"): Promise<void> {
    if (this.activeEditorBlocked()) {
      void vscode.window.showWarningMessage(
        `Envpilot: ${action === "cut" ? "Cutting" : "Copying"} from protected .env files is not allowed. Secret values are managed securely.`
      );
      return;
    }

    this.syncContextKey();
    await vscode.commands.executeCommand(
      action === "cut"
        ? "editor.action.clipboardCutAction"
        : "editor.action.clipboardCopyAction"
    );
  }

  private normalizePath(filePath: string): string {
    // Case-folded comparison key — casing differences must not bypass the map.
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
