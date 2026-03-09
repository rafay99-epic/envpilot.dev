import * as vscode from "vscode";
import * as path from "path";
import { StorageService } from "../utils/storage";

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

  async provideCodeLenses(
    document: vscode.TextDocument
  ): Promise<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration("envpilot");
    if (!config.get<boolean>("enableCodeLens", true)) {
      return [];
    }

    const filePath = document.uri.fsPath;
    const fileName = path.basename(filePath);

    // Only apply to .env files
    if (!fileName.startsWith(".env")) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    const topRange = new vscode.Range(0, 0, 0, 0);

    const firstLine = document.lineAt(0).text;
    const isManaged = firstLine.includes(ENVPILOT_HEADER);

    if (isManaged) {
      // Parse header for info
      const headerInfo = this.parseHeader(document);

      const infoText = [
        "$(shield) Managed by Envpilot",
        headerInfo.varCount !== null ? `${headerInfo.varCount} vars` : null,
        headerInfo.environment,
        headerInfo.syncTime
          ? `Synced ${this.formatTime(headerInfo.syncTime)}`
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
    } else {
      // Check if this directory is linked
      const dirPath = path.dirname(filePath);
      const linkedProject = await this.findLinkedProjectForDir(dirPath);

      if (linkedProject) {
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

    // Scan header comment lines (first ~10 lines)
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

    // Count non-comment, non-empty lines for variable count
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

  private async findLinkedProjectForDir(dirPath: string): Promise<boolean> {
    const linkedProjects = await this.storage.getLinkedProjectsV2();
    for (const project of linkedProjects) {
      for (const dir of project.directories) {
        if (path.normalize(dir.directoryPath) === path.normalize(dirPath)) {
          return true;
        }
      }
    }
    return false;
  }

  private formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  }

  dispose(): void {
    this._onDidChangeCodeLenses.dispose();
  }
}
