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
  /**
   * Cached from the last update() call so tooltip/text building stays sync —
   * refreshed once per update() (itself only invoked on auth/sync/manual
   * refresh events, not on a render loop) rather than re-queried per call.
   */
  private activeAccountEmail: string | undefined;
  private accountCount = 0;

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

    this.authService.onAuthStateChanged(() => {
      this.update();
    });
    this.syncService.onSyncComplete((result) =>
      this.handleSyncComplete(result)
    );
    this.syncService.onPermissionRevoked((project) =>
      this.handlePermissionRevoked(project)
    );
    this.syncService.onConnectionStateChanged(() => this.update());

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
    await this.refreshAccountInfo();

    if (allLinkedProjects.length === 0 && !linkedProject) {
      this.statusBarItem.text = "$(shield) Envpilot";
      const lines = [
        "Signed in \u2014 no project linked",
        "Click to link a project",
      ];
      const accountHint = this.buildAccountHintText();
      if (accountHint) lines.push("", accountHint);
      this.statusBarItem.tooltip = lines.join("\n");
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
      const syncingLines = ["Syncing variables\u2026"];
      const syncingAccountHint = this.buildAccountHintText();
      if (syncingAccountHint) syncingLines.push("", syncingAccountHint);
      this.statusBarItem.tooltip = syncingLines.join("\n");
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

  /**
   * Surface real-time sync connectivity so a silently-dead WebSocket isn't
   * invisible (see RealTimeSyncService's bounded-backoff reconnect check).
   * Only applies once a project is linked — this method runs after the
   * "not authenticated" / "no project linked" early returns.
   */
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
      : "$(debug-disconnect) Real-time sync disconnected — retrying periodically in the background.";

    if (this.statusBarItem.tooltip instanceof vscode.MarkdownString) {
      this.statusBarItem.tooltip.appendMarkdown(`\n\n---\n\n${note}`);
    }
  }

  /**
   * Refresh the cached active-account email and total account count. Called
   * once per update() (itself only invoked on sign-in/out/switch and other
   * discrete UI-refresh events, never on a render loop), so this stays a
   * single pair of lightweight storage reads rather than a per-paint cost.
   */
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

  /** Plain-text account line for tooltips that aren't MarkdownStrings. */
  private buildAccountHintText(): string | undefined {
    if (!this.activeAccountEmail) {
      return undefined;
    }
    return this.accountCount > 1
      ? `Signed in as ${this.activeAccountEmail} (${this.accountCount} accounts — run "Envpilot: Switch Account" to switch)`
      : `Signed in as ${this.activeAccountEmail}`;
  }

  /** Appends the active-account line (and multi-account hint) to a MarkdownString tooltip. */
  private appendAccountInfo(): void {
    if (
      !this.activeAccountEmail ||
      !(this.statusBarItem.tooltip instanceof vscode.MarkdownString)
    ) {
      return;
    }

    const hint =
      this.accountCount > 1
        ? `$(account) ${this.activeAccountEmail} · ${this.accountCount} accounts — run "Envpilot: Switch Account" to switch`
        : `$(account) ${this.activeAccountEmail}`;

    this.statusBarItem.tooltip.appendMarkdown(`\n\n---\n\n${hint}`);
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

    // Successful syncs update the status bar silently — this fires once per
    // directory on every background sync, so toasts here are pure noise
    // (manual pulls already show an aggregate notification).
    if (!result.success) {
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
