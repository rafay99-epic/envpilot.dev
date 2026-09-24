import * as vscode from "vscode";
import * as path from "path";
import { StorageService } from "../utils/storage";
import { pathsEqual } from "../utils/paths";
import { formatTime } from "./statusBar";

const ENVPILOT_HEADER = "# Envpilot";

export class EnvCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private storage: StorageService;

  constructor(storage: StorageService) {
    this.storage = storage;
  }

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration("envpilot");
    if (!config.get<boolean>("enableCodeLens", true)) {
      return [];
    }

    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

    if (!fileName.startsWith(".env")) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const topRange = new vscode.Range(0, 0, 0, 0);

    const firstLine = document.lineAt(0).text;
    const isManaged = firstLine.includes(ENVPILOT_HEADER);

    if (isManaged) {
      const headerInfo = this.parseHeader(document);

      const infoText = [
        "$(shield) Managed by Envpilot",
        headerInfo.varCount !== null ? `${headerInfo.varCount} vars` : null,
        headerInfo.environment,
        headerInfo.syncTime
          ? `Synced ${formatTime(headerInfo.syncTime)}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      lenses.push(
        new vscode.CodeLens(topRange, {
          title: infoText,
          command: "envpilot.showStatus",
        })
      );

      lenses.push(
        new vscode.CodeLens(topRange, {
          title: "$(cloud-download) Pull Latest",
          command: "envpilot.pullVariables",
        })
      );
    } else if (this.isLinkedDir(path.dirname(filePath))) {
      lenses.push(
        new vscode.CodeLens(topRange, {
          title: "$(cloud-download) Sync from Envpilot",
          command: "envpilot.pullVariables",
        })
      );
    } else {
      lenses.push(
        new vscode.CodeLens(topRange, {
          title: "$(link) Link this directory to Envpilot",
          command: "envpilot.linkProject",
        })
      );
    }

    return lenses;
  }

  private parseHeader(document: vscode.TextDocument): {
    varCount: number | null;
    environment: string | null;
    syncTime: number | null;
  } {
    let varCount: number | null = null;
    let environment: string | null = null;
    let syncTime: number | null = null;

    const maxLines = Math.min(document.lineCount, 10);
    for (let i = 0; i < maxLines; i++) {
      const line = document.lineAt(i).text;
      if (!line.startsWith("#")) break;

      const envMatch = line.match(/Environment:\s*(.+)/i);
      if (envMatch) environment = envMatch[1].trim();

      const syncMatch = line.match(/Synced:\s*(.+)/i);
      if (syncMatch) {
        const parsed = Date.parse(syncMatch[1].trim());
        if (!isNaN(parsed)) syncTime = parsed;
      }
    }

    let count = 0;
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i).text.trim();
      if (line && !line.startsWith("#") && line.includes("=")) {
        count++;
      }
    }
    if (count > 0) varCount = count;

    return { varCount, environment, syncTime };
  }

  private isLinkedDir(dirPath: string): boolean {
    return this.storage
      .getLinkedProjectsMetadataV2()
      .some((project) =>
        project.directories.some((dir) =>
          pathsEqual(dir.directoryPath, dirPath)
        )
      );
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
