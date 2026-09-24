import * as vscode from "vscode";
import { computeCloakRanges, detectCloakFormat } from "../utils/cloakRanges";

const MASK = "••••••";

const REVEAL_MS = 30_000;

export class CloakService {
  private decoration: vscode.TextEditorDecorationType;
  private disposables: vscode.Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private revealTimer: NodeJS.Timeout | null = null;
  private revealed = false;
  private pending = new Set<vscode.TextDocument>();

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

  activate(): void {
    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors((editors) => {
        for (const editor of editors) this.apply(editor);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== "file") return;
        if (!this.isManaged(e.document.uri.fsPath)) return;
        this.pending.add(e.document);
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.debounceTimer = null;
          for (const editor of vscode.window.visibleTextEditors) {
            if (this.pending.has(editor.document)) this.apply(editor);
          }
          this.pending.clear();
        }, 200);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("envpilot.cloakValues")) this.refresh();
      })
    );
    this.refresh();
  }

  isEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("envpilot")
      .get<boolean>("cloakValues", true);
  }

  refresh(): void {
    for (const editor of vscode.window.visibleTextEditors) this.apply(editor);
  }

  private apply(editor: vscode.TextEditor): void {
    const { document } = editor;
    if (document.uri.scheme !== "file") return;
    if (
      !this.isEnabled() ||
      this.revealed ||
      !this.isManaged(document.uri.fsPath)
    ) {
      editor.setDecorations(this.decoration, []);
      return;
    }
    const format = detectCloakFormat(document.uri.fsPath, document.languageId);
    const lines: string[] = [];
    for (let line = 0; line < document.lineCount; line++) {
      lines.push(document.lineAt(line).text);
    }
    editor.setDecorations(
      this.decoration,
      computeCloakRanges(format, lines).map(
        (r) => new vscode.Range(r.line, r.start, r.line, r.end)
      )
    );
  }

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
    this.pending.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.decoration.dispose();
  }
}
