import * as vscode from "vscode";
import { computeCloakRanges, detectCloakFormat } from "../utils/cloakRanges";

/**
 * Fixed-length mask so the decoration never leaks the real value's length.
 */
const MASK = "••••••";

const REVEAL_MS = 30_000;

/**
 * CloakService visually masks variable values in Envpilot-managed .env files.
 * The real text stays in the document (sync, diff, and saving are untouched);
 * a decoration hides the value glyphs (opacity 0 + collapsed letter spacing)
 * and renders a fixed-length bullet mask in their place.
 *
 * Controlled by the "envpilot.cloakValues" setting (read live), the
 * "envpilot.toggleCloaking" command, and a 30-second reveal command.
 */
export class CloakService {
  private decoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private revealTimer: NodeJS.Timeout | null = null;
  private revealed = false;

  constructor(private isManaged: (fsPath: string) => boolean) {
    this.decoration = vscode.window.createTextEditorDecorationType({
      opacity: "0",
      letterSpacing: "-1ch",
      after: {
        contentText: MASK,
        color: new vscode.ThemeColor("editor.foreground"),
      },
    });
  }

  /** Wire editor/document/config listeners. Call once at activation. */
  activate(): void {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      // Decorations are per-TextEditor: an editor surfaced without an
      // active-editor change (showTextDocument with preserveFocus, layout
      // changes) starts undecorated and must be re-cloaked.
      vscode.window.onDidChangeVisibleTextEditors(() => this.refresh()),
      vscode.workspace.onDidOpenTextDocument(() => this.refresh()),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.isManaged(e.document.uri.fsPath)) return;
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          this.refresh();
        }, 200);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("envpilot.cloakValues")) this.refresh();
      })
    );
    this.refresh();
  }

  /** Whether cloaking is currently on (public: the toggle command needs it
   * to decide which direction requires the reveal capability). */
  isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("envpilot")
      .get<boolean>("cloakValues", true);
  }

  /** Re-apply (or clear) decorations on every visible editor. */
  refresh(): void {
    const active = this.isEnabled() && !this.revealed;
    for (const editor of vscode.window.visibleTextEditors) {
      if (!active || !this.isManaged(editor.document.uri.fsPath)) {
        editor.setDecorations(this.decoration, []);
        continue;
      }
      // The format decides how to mask, derived from the path alone. That
      // matters for correctness, not just tidiness: it works the instant the
      // clipboard guard re-arms from the manifest at activation, BEFORE the
      // first sync. Keying off a registry the sync populates left every
      // value visible from window-open until that sync landed.
      const format = detectCloakFormat(
        editor.document.uri.fsPath,
        editor.document.languageId
      );

      const lines: string[] = [];
      for (let line = 0; line < editor.document.lineCount; line++) {
        lines.push(editor.document.lineAt(line).text);
      }

      editor.setDecorations(
        this.decoration,
        computeCloakRanges(format, lines).map(
          (r) => new vscode.Range(r.line, r.start, r.line, r.end)
        )
      );
    }
  }

  /** Toggle the envpilot.cloakValues setting (global). */
  async toggle(): Promise<void> {
    const next = !this.isEnabled();
    await vscode.workspace
      .getConfiguration("envpilot")
      .update("cloakValues", next, vscode.ConfigurationTarget.Global);
    this.refresh();
    vscode.window.showInformationMessage(
      next
        ? "Envpilot: Value cloaking enabled."
        : "Envpilot: Value cloaking disabled."
    );
  }

  /** Suspend cloaking for 30 seconds, then re-apply. */
  reveal(): void {
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealed = true;
    this.refresh();
    this.revealTimer = setTimeout(() => {
      this.revealTimer = null;
      this.revealed = false;
      this.refresh();
    }, REVEAL_MS);
    vscode.window.showInformationMessage(
      "Envpilot: Values revealed for 30 seconds."
    );
  }

  dispose(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.debounceTimer = null;
    this.revealTimer = null;
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.decoration.dispose();
  }
}
