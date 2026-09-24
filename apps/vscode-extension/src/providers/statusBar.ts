import * as vscode from "vscode";
import { AuthService } from "../services/auth";
import { SyncService, type SyncConnectionState } from "../services/sync";
import type { StorageService } from "../utils/storage";
import type { LinkedProject, LinkedProjectV2, SyncResult } from "../types";
import * as output from "../utils/outputChannel";

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem;
  private authService: AuthService;
  private syncService: SyncService;
  private storageService: StorageService;
  private isSyncing = false;
  private lastSyncResult: SyncResult | null = null;
  private errorClearTimer: ReturnType<typeof setTimeout> | null = null;
  private activeAccountEmail: string | undefined;
  private accountCount = 0;
  private disposables: vscode.Disposable[] = [];

  constructor(
    authService: AuthService,
    syncService: SyncService,
    storageService: StorageService
  ) {
    this.authService = authService;
    this.syncService = syncService;
    this.storageService = storageService;

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "envpilot.showStatus";

    this.disposables.push(
      this.authService.onAuthStateChanged(() => void this.update()),
      this.syncService.onSyncComplete((result) =>
        this.handleSyncComplete(result)
      ),
      this.syncService.onPermissionRevoked((project) =>
        this.handlePermissionRevoked(project)
      ),
      this.syncService.onConnectionStateChanged(() => void this.update())
    );

    void this.update();
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
    await this.refreshAccountInfo();

    if (allLinkedProjects.length === 0 && !linkedProject) {
      this.statusBarItem.text = "$(shield) Envpilot";
      const lines = ["Signed in, no project linked", "Click to link a project"];
      const accountHint = this.buildAccountHintText();
      if (accountHint) lines.push("", accountHint);
      this.statusBarItem.tooltip = lines.join("\n");
      this.statusBarItem.command = "envpilot.linkProject";
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    this.statusBarItem.command = "envpilot.showStatus";

    if (this.isSyncing) {
      const name =
        allLinkedProjects.length > 0
          ? allLinkedProjects[0].projectName
          : linkedProject?.projectName;
      this.statusBarItem.text = `$(sync~spin) ${name}`;
      const syncingLines = ["Syncing variables\u2026"];
      const syncingAccountHint = this.buildAccountHintText();
      if (syncingAccountHint) syncingLines.push("", syncingAccountHint);
      this.statusBarItem.tooltip = syncingLines.join("\n");
      this.statusBarItem.backgroundColor = undefined;
      return;
    }

    if (allLinkedProjects.length > 1) {
      this.statusBarItem.text = `$(shield) Envpilot: ${allLinkedProjects.length} projects`;
      this.statusBarItem.tooltip =
        this.buildMultiProjectTooltip(allLinkedProjects);
    } else if (allLinkedProjects.length === 1) {
      this.statusBarItem.text = `$(shield) ${allLinkedProjects[0].projectName}`;
      this.statusBarItem.tooltip = this.buildV2Tooltip(allLinkedProjects[0]);
    } else if (linkedProject) {
      const syncInfo = linkedProject.lastSyncedAt
        ? `Synced ${formatTime(linkedProject.lastSyncedAt)}`
        : "Never synced";

      this.statusBarItem.text = `$(shield) ${linkedProject.projectName}`;
      const md = new vscode.MarkdownString("", true);
      md.appendMarkdown("### $(shield) ");
      md.appendText(linkedProject.projectName);
      md.appendMarkdown("\n\n$(organization) ");
      md.appendText(linkedProject.organizationName);
      md.appendMarkdown("\n\n$(server-environment) ");
      md.appendText(linkedProject.environment);
      md.appendMarkdown("\n\n$(file) ");
      md.appendText(linkedProject.targetFile);
      md.appendMarkdown(`\n\n$(sync) ${syncInfo}`);
      if (this.lastSyncResult) {
        md.appendMarkdown(
          `\n\n$(symbol-variable) ${this.lastSyncResult.variablesCount} variables`
        );
      }
      this.statusBarItem.tooltip = md;
    }

    this.appendAccountInfo();
    this.applyConnectionIndicator();

    if (
      !this.errorClearTimer &&
      this.syncService.getConnectionState() !== "disconnected"
    ) {
      this.statusBarItem.backgroundColor = undefined;
    } else if (this.syncService.getConnectionState() === "disconnected") {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    }
  }

  private applyConnectionIndicator(): void {
    const state: SyncConnectionState = this.syncService.getConnectionState();
    if (state === "connected") {
      return;
    }

    const isReconnecting = state === "reconnecting";
    this.statusBarItem.text += isReconnecting
      ? " $(sync~spin)"
      : " $(debug-disconnect)";

    const note = isReconnecting
      ? "$(sync~spin) Reconnecting to Envpilot… real-time updates are paused."
      : "$(debug-disconnect) Real-time sync disconnected, retrying periodically in the background.";

    if (this.statusBarItem.tooltip instanceof vscode.MarkdownString) {
      this.statusBarItem.tooltip.appendMarkdown(`\n\n---\n\n${note}`);
    }
  }

  private async refreshAccountInfo(): Promise<void> {
    const [accounts, activeAccountId] = await Promise.all([
      this.storageService.listAccounts(),
      this.storageService.getActiveAccountId(),
    ]);
    const activeAccount =
      accounts.find((account) => account.user.id === activeAccountId) ||
      accounts[0];
    this.activeAccountEmail = activeAccount?.user.email;
    this.accountCount = accounts.length;
  }

  private buildAccountHintText(): string | undefined {
    if (!this.activeAccountEmail) {
      return undefined;
    }
    return this.accountCount > 1
      ? `Signed in as ${this.activeAccountEmail} (${this.accountCount} accounts, run "Envpilot: Switch Account" to switch)`
      : `Signed in as ${this.activeAccountEmail}`;
  }

  private appendAccountInfo(): void {
    if (
      !this.activeAccountEmail ||
      !(this.statusBarItem.tooltip instanceof vscode.MarkdownString)
    ) {
      return;
    }

    const tooltip = this.statusBarItem.tooltip;
    tooltip.appendMarkdown("\n\n---\n\n$(account) ");
    tooltip.appendText(this.activeAccountEmail);
    if (this.accountCount > 1) {
      tooltip.appendMarkdown(
        ` · ${this.accountCount} accounts, run "Envpilot: Switch Account" to switch`
      );
    }
  }

  private buildMultiProjectTooltip(
    projects: LinkedProjectV2[]
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString("", true);
    md.appendMarkdown(
      `### $(shield) Envpilot: ${projects.length} Projects Linked\n\n`
    );
    for (const project of projects) {
      md.appendMarkdown("---\n\n**$(folder-library) ");
      md.appendText(project.projectName);
      md.appendMarkdown("**\n\n$(organization) ");
      md.appendText(project.organizationName);
      md.appendMarkdown(
        `\n\n$(file-directory) ${project.directories.length} director${project.directories.length !== 1 ? "ies" : "y"}\n\n`
      );
    }
    return md;
  }

  private buildV2Tooltip(project: LinkedProjectV2): vscode.MarkdownString {
    const md = new vscode.MarkdownString("", true);
    md.appendMarkdown("### $(shield) ");
    md.appendText(project.projectName);
    md.appendMarkdown("\n\n$(organization) ");
    md.appendText(project.organizationName);

    if (project.directories.length > 0) {
      md.appendMarkdown("\n\n---\n\n**Directories:**\n");
      for (const dir of project.directories) {
        const syncInfo = dir.lastSyncedAt
          ? formatTime(dir.lastSyncedAt)
          : "never";
        md.appendMarkdown("\n- $(folder-opened) ");
        md.appendText(dir.displayName || dir.directoryPath);
        md.appendMarkdown(": ");
        md.appendText(
          `${dir.environments.join(", ")} \u2192 ${dir.targetFile} \u00b7 synced ${syncInfo}`
        );
      }
    }

    if (this.lastSyncResult) {
      md.appendMarkdown(
        `\n\n$(symbol-variable) ${this.lastSyncResult.variablesCount} variables`
      );
    }
    return md;
  }

  setSyncing(syncing: boolean): void {
    this.isSyncing = syncing;
    void this.update();
  }

  private handleSyncComplete(result: SyncResult): void {
    this.isSyncing = false;
    this.lastSyncResult = result;
    void this.update();

    if (!result.success) {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );

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

  dispose(): void {
    if (this.errorClearTimer) clearTimeout(this.errorClearTimer);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.statusBarItem.dispose();
  }
}

export function formatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString();
}
