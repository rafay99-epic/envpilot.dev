import * as vscode from "vscode";
import * as crypto from "crypto";
import { AuthService } from "../services/auth";
import { ApiService } from "../services/api";
import { SyncService } from "../services/sync";
import { StorageService } from "../utils/storage";
import {
  getDashboardCss,
  getDashboardBody,
  getDashboardJs,
} from "./dashboardHtml";
import type { LinkedProjectV2, User } from "../types";
import * as output from "../utils/outputChannel";

interface DashboardState {
  isAuthenticated: boolean;
  user: User | null;
  linkedProjects: LinkedProjectV2[];
  activeProject: LinkedProjectV2 | null;
  variableCount: number | null;
  isSyncing: boolean;
}

interface WebviewMessage {
  type: string;
  projectId?: string;
  directoryPath?: string;
}

export class DashboardPanelProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private isSyncing = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly authService: AuthService,
    private readonly apiService: ApiService,
    private readonly syncService: SyncService,
    private readonly storageService: StorageService
  ) {}

  show(): void {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "envpilot.dashboard",
      "Envpilot Dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    this.panel.iconPath = vscode.Uri.joinPath(
      this.extensionUri,
      "media",
      "icon.svg"
    );
    this.panel.webview.html = this.getHtmlContent();

    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleWebviewMessage(msg),
      undefined
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    await this.postStateUpdate();
  }

  notifySyncStarted(): void {
    this.isSyncing = true;
    if (!this.panel) return;
    this.panel.webview.postMessage({ type: "syncStarted" });
  }

  notifySyncCompleted(): void {
    this.isSyncing = false;
    this.refresh();
  }

  private async postStateUpdate(): Promise<void> {
    if (!this.panel) return;

    try {
      const state = await this.gatherState();
      this.panel.webview.postMessage({ type: "stateUpdate", state });
    } catch (err) {
      output.error(
        `Dashboard state update failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private async gatherState(): Promise<DashboardState> {
    const isAuthenticated = await this.authService.isAuthenticated();
    let user: User | null = null;
    let linkedProjects: LinkedProjectV2[] = [];
    let activeProject: LinkedProjectV2 | null = null;
    let variableCount: number | null = null;

    if (isAuthenticated) {
      user = await this.authService.getCurrentUser();
      linkedProjects = await this.storageService.getLinkedProjectsV2();
      activeProject =
        (await this.syncService.getLinkedProjectV2ForWorkspace()) || null;

      // Try to get variable count for active project
      if (activeProject) {
        try {
          const dir = activeProject.directories[0];
          if (dir) {
            const vars = await this.apiService.getVariables(
              activeProject.projectId,
              dir.environments[0] || "development",
              activeProject.accessToken
            );
            variableCount = vars.length;
          }
        } catch {
          // Not critical
        }
      }
    }

    return {
      isAuthenticated,
      user,
      linkedProjects,
      activeProject,
      variableCount,
      isSyncing: this.isSyncing,
    };
  }

  private handleWebviewMessage(message: WebviewMessage): void {
    switch (message.type) {
      case "ready":
        this.postStateUpdate();
        break;
      case "pullVariables":
        vscode.commands.executeCommand("envpilot.pullVariables");
        break;
      case "linkProject":
        vscode.commands.executeCommand("envpilot.linkProject");
        break;
      case "unlinkProject":
        vscode.commands.executeCommand("envpilot.unlinkProject");
        break;
      case "addDirectory":
        vscode.commands.executeCommand("envpilot.addDirectory");
        break;
      case "removeDirectory":
        // The remove directory command expects a tree item, but from webview
        // we trigger the command without args — user picks from quick pick
        vscode.commands.executeCommand("envpilot.removeDirectory");
        break;
      case "signIn":
        vscode.commands.executeCommand("envpilot.signIn");
        break;
      case "signOut":
        vscode.commands.executeCommand("envpilot.signOut");
        break;
      case "openDashboard":
        vscode.commands.executeCommand("envpilot.openDashboard");
        break;
      case "refresh":
        vscode.commands.executeCommand("envpilot.refresh");
        this.refresh();
        break;
    }
  }

  private getHtmlContent(): string {
    const nonce = crypto.randomBytes(16).toString("hex");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>${getDashboardCss()}</style>
</head>
<body>
  ${getDashboardBody()}
  <script nonce="${nonce}">${getDashboardJs()}</script>
</body>
</html>`;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
