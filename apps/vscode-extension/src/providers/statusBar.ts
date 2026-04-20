import * as vscode from "vscode";
import { AuthService } from "../services/auth";
import { SyncService } from "../services/sync";
import type { LinkedProject, LinkedProjectV2, SyncResult } from "../types";
import * as output from "../utils/outputChannel";

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private authService: AuthService;
  private syncService: SyncService;
  private isSyncing = false;
  private lastSyncResult: SyncResult | null = null;
  private errorClearTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(authService: AuthService, syncService: SyncService) {
    this.authService = authService;
    this.syncService = syncService;

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "envpilot.showStatus";

    this.authService.onAuthStateChanged(() => {
      this.update();
    });
    this.syncService.onSyncComplete((result) =>
      this.handleSyncComplete(result)
    );
    this.syncService.onPermissionRevoked((project) =>
      this.handlePermissionRevoked(project)
    );

    this.update();
    this.statusBarItem.show();
  }

  async update(): Promise<void> {
    const isAuthenticated = await this.authService.isAuthenticated();

    if (!isAuthenticated) {
      this.statusBarItem.text = "$(shield) Envpilot";
      this.statusBarItem.tooltip = "Click to sign in to Envpilot";
      this.statusBarItem.command = "envpilot.signIn";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    const allLinkedProjects = await this.syncService.getAllLinkedProjectsV2();
    const linkedProject = await this.syncService.getLinkedProject();

    if (allLinkedProjects.length === 0 && !linkedProject) {
      this.statusBarItem.text = "$(shield) Envpilot";
      this.statusBarItem.tooltip =
        "Signed in \u2014 no project linked\nClick to link a project";
      this.statusBarItem.command = "envpilot.linkProject";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Restore default command for linked state
    this.statusBarItem.command = "envpilot.showStatus";

    if (this.isSyncing) {
      const name =
        allLinkedProjects.length > 0
          ? allLinkedProjects[0].projectName
          : linkedProject?.projectName;
      this.statusBarItem.text = `$(sync~spin) ${name}`;
      this.statusBarItem.tooltip = "Syncing variables\u2026";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    // Build tooltip for V2 (multi-project / multi-directory) or V1
    if (allLinkedProjects.length > 1) {
      // Multiple projects linked
      this.statusBarItem.text = `$(shield) Envpilot: ${allLinkedProjects.length} projects`;
      this.statusBarItem.tooltip =
        this.buildMultiProjectTooltip(allLinkedProjects);
    } else if (allLinkedProjects.length === 1) {
      this.statusBarItem.text = `$(shield) ${allLinkedProjects[0].projectName}`;
      this.statusBarItem.tooltip = this.buildV2Tooltip(allLinkedProjects[0]);
    } else if (linkedProject) {
      const syncInfo = linkedProject.lastSyncedAt
        ? `Synced ${this.formatTime(linkedProject.lastSyncedAt)}`
        : "Never synced";

      this.statusBarItem.text = `$(shield) ${linkedProject.projectName}`;
      const md = new vscode.MarkdownString(
        [
          `### $(shield) ${linkedProject.projectName}`,
          "",
          `$(organization) ${linkedProject.organizationName}`,
          `$(server-environment) ${linkedProject.environment}`,
          `$(file) ${linkedProject.targetFile}`,
          "",
          `$(sync) ${syncInfo}`,
          this.lastSyncResult
            ? `$(symbol-variable) ${this.lastSyncResult.variablesCount} variables`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
      md.supportThemeIcons = true;
      this.statusBarItem.tooltip = md;
    }

    if (!this.errorClearTimer) {
      this.statusBarItem.backgroundColor = undefined;
    }
  }

  private buildMultiProjectTooltip(
    projects: LinkedProjectV2[]
  ): vscode.MarkdownString {
    const lines: string[] = [
      `### $(shield) Envpilot — ${projects.length} Projects Linked`,
      "",
    ];

    for (const project of projects) {
      lines.push(
        "---",
        "",
        `**$(folder-library) ${project.projectName}**`,
        `$(organization) ${project.organizationName}`,
        `$(file-directory) ${project.directories.length} director${project.directories.length !== 1 ? "ies" : "y"}`,
        ""
      );
    }

    const md = new vscode.MarkdownString(lines.join("\n"));
    md.supportThemeIcons = true;
    return md;
  }

  private buildV2Tooltip(project: LinkedProjectV2): vscode.MarkdownString {
    const lines: string[] = [
      `### $(shield) ${project.projectName}`,
      "",
      `$(organization) ${project.organizationName}`,
    ];

    if (project.directories.length > 0) {
      lines.push("", "---", "", "**Directories:**");
      for (const dir of project.directories) {
        const syncInfo = dir.lastSyncedAt
          ? this.formatTime(dir.lastSyncedAt)
          : "never";
        const envs = dir.environments.join(", ");
        lines.push(
          `- $(folder-opened) \`${dir.displayName || dir.directoryPath}\``,
          `  ${envs} \u2192 ${dir.targetFile} \u00b7 synced ${syncInfo}`
        );
      }
    }

    if (this.lastSyncResult) {
      lines.push(
        "",
        `$(symbol-variable) ${this.lastSyncResult.variablesCount} variables`
      );
    }

    const md = new vscode.MarkdownString(lines.join("\n"));
    md.supportThemeIcons = true;
    return md;
  }

  setSyncing(syncing: boolean): void {
    this.isSyncing = syncing;
    this.update();
  }

  private handleSyncComplete(result: SyncResult): void {
    this.isSyncing = false;
    this.lastSyncResult = result;
    this.update();

    if (result.success) {
      vscode.window.showInformationMessage(
        `Synced ${result.variablesCount} variables to ${result.targetFile}`
      );
    } else {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );

      // Auto-clear error background after 10 seconds
      if (this.errorClearTimer) clearTimeout(this.errorClearTimer);
      this.errorClearTimer = setTimeout(() => {
        this.statusBarItem.backgroundColor = undefined;
        this.errorClearTimer = null;
      }, 10000);

      const showDetails = "Show Details";
      vscode.window
        .showErrorMessage(`Sync failed: ${result.error}`, showDetails)
        .then((action) => {
          if (action === showDetails) {
            output.show();
          }
        });
    }
  }

  private handlePermissionRevoked(
    project: LinkedProject | LinkedProjectV2
  ): void {
    this.statusBarItem.text = `$(warning) ${project.projectName}`;
    this.statusBarItem.tooltip = `Access revoked for ${project.projectName}`;
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
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
    if (this.errorClearTimer) clearTimeout(this.errorClearTimer);
    this.statusBarItem.dispose();
  }
}
