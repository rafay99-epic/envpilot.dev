import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import { formatRoleLabel, normalizeOrgRole } from "../roles";
import type { EnvironmentVariable, LinkedProjectV2 } from "../types";

/** Coalesce rapid-fire refresh() calls into a single tree-data event. */
const REFRESH_DEBOUNCE_MS = 150;

export class VariablesTreeProvider implements vscode.TreeDataProvider<VariableTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    VariableTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiService;
  private storage: StorageService;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(api: ApiService, storage: StorageService) {
    this.api = api;
    this.storage = storage;
  }

  /**
   * Requests a tree refresh. Multiple calls within REFRESH_DEBOUNCE_MS are
   * coalesced into a single `onDidChangeTreeData` event — several call sites
   * (auth changes, revocations, link/unlink, manual refresh) can fire in
   * quick succession for what is effectively one user action, and each fire()
   * makes VS Code re-invoke getChildren for the root and every expanded node.
   */
  refresh(): void {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this._onDidChangeTreeData.fire();
    }, REFRESH_DEBOUNCE_MS);
  }

  getTreeItem(element: VariableTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VariableTreeItem): Promise<VariableTreeItem[]> {
    // Expanding a project node — show its variables
    if (element && element.type === "project" && element.linkedProject) {
      return this.getVariablesForProject(element.linkedProject);
    }

    // Expanding any other node — no children
    if (element) {
      return [];
    }

    // Root level
    const linkedProjects = await this.storage.getLinkedProjectsV2();

    if (linkedProjects.length === 0) {
      return [];
    }

    // Single project — flat display (backward compatible)
    if (linkedProjects.length === 1) {
      return this.getVariablesForProject(linkedProjects[0]);
    }

    // Multiple projects — show collapsible project nodes
    return linkedProjects.map(
      (project) =>
        new VariableTreeItem(
          project.projectName,
          vscode.TreeItemCollapsibleState.Collapsed,
          "project",
          undefined,
          `${project.organizationName} · ${project.directories.length} dir${project.directories.length !== 1 ? "s" : ""}`,
          project
        )
    );
  }

  private async getVariablesForProject(
    linkedProject: LinkedProjectV2
  ): Promise<VariableTreeItem[]> {
    const env = linkedProject.defaultEnvironment || "development";

    try {
      // Metadata only — the tree never displays values, so don't make the
      // server decrypt every variable from the vault just to render names.
      const variables = await this.api.getVariablesMetadata(
        linkedProject.projectId,
        env,
        linkedProject.accessToken
      );

      if (variables.length === 0) {
        return [
          new VariableTreeItem(
            "No variables",
            vscode.TreeItemCollapsibleState.None,
            "message",
            undefined,
            `No variables for ${env}`
          ),
        ];
      }

      const regularVars = variables.filter((v) => !v.isSensitive);
      const sensitiveVars = variables.filter((v) => v.isSensitive);

      const items: VariableTreeItem[] = [];

      // Environment & count header \u2014 always route the role through the
      // unified normalizer/label formatter (never compare raw legacy
      // strings) so the tree shows the same role vocabulary as web/CLI.
      const role = this.api.getUserRole(linkedProject.projectId);
      const projectRole = this.api.getProjectRole(linkedProject.projectId);

      let roleLabel = "";
      if (role || projectRole) {
        roleLabel = ` \u00b7 ${formatRoleLabel(role)}`;
        // Legacy "viewer" project role means grant-only / not assigned to
        // the project \u2014 formatRoleLabel only knows org-level tiers, so it
        // can't express that distinction on its own; annotate it here.
        if (projectRole === "viewer") {
          roleLabel += " (view-only)";
        }
      }

      items.push(
        new VariableTreeItem(
          env,
          vscode.TreeItemCollapsibleState.None,
          "header",
          undefined,
          `${variables.length} variable${variables.length !== 1 ? "s" : ""}${roleLabel}`
        )
      );

      // Regular variables
      for (const variable of regularVars) {
        items.push(
          new VariableTreeItem(
            variable.key,
            vscode.TreeItemCollapsibleState.None,
            "variable",
            variable
          )
        );
      }

      // Sensitive section
      if (sensitiveVars.length > 0) {
        items.push(
          new VariableTreeItem(
            `Sensitive (${sensitiveVars.length})`,
            vscode.TreeItemCollapsibleState.None,
            "separator"
          )
        );

        for (const variable of sensitiveVars) {
          items.push(
            new VariableTreeItem(
              variable.key,
              vscode.TreeItemCollapsibleState.None,
              "sensitive",
              variable
            )
          );
        }
      }

      // Pending requests for members/viewers — recognize the unified
      // "developer" tier too (normalizeOrgRole maps legacy "member" onto
      // it), so this keeps working if the server ever sends a unified role
      // string in place of the legacy one. Guard on `role` being present so
      // an unpopulated cache (normalizeOrgRole's "developer" default) doesn't
      // spuriously trigger the extra pending-requests fetch below.
      if (
        (role && normalizeOrgRole(role) === "developer") ||
        projectRole === "viewer"
      ) {
        try {
          const pendingRequests = await this.api.getVariableRequests(
            linkedProject.projectId,
            "pending"
          );

          if (pendingRequests.length > 0) {
            items.push(
              new VariableTreeItem(
                `Pending Requests (${pendingRequests.length})`,
                vscode.TreeItemCollapsibleState.None,
                "separator"
              )
            );

            for (const request of pendingRequests) {
              items.push(
                new VariableTreeItem(
                  request.key,
                  vscode.TreeItemCollapsibleState.None,
                  "request",
                  undefined,
                  request.status
                )
              );
            }
          }
        } catch {
          // Not critical
        }
      }

      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return [
        new VariableTreeItem(
          `Error: ${message}`,
          vscode.TreeItemCollapsibleState.None,
          "error"
        ),
      ];
    }
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this._onDidChangeTreeData.dispose();
  }
}

type VariableTreeItemType =
  | "variable"
  | "sensitive"
  | "header"
  | "separator"
  | "message"
  | "error"
  | "request"
  | "project";

export class VariableTreeItem extends vscode.TreeItem {
  type: VariableTreeItemType;
  variable?: EnvironmentVariable;
  linkedProject?: LinkedProjectV2;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: VariableTreeItemType,
    variable?: EnvironmentVariable,
    description?: string,
    linkedProject?: LinkedProjectV2
  ) {
    super(label, collapsibleState);
    this.type = type;
    this.variable = variable;
    this.linkedProject = linkedProject;
    this.contextValue = type;

    switch (type) {
      case "project": {
        this.iconPath = new vscode.ThemeIcon(
          "folder-library",
          new vscode.ThemeColor("charts.green")
        );
        this.description = description;
        break;
      }

      case "variable": {
        this.iconPath = new vscode.ThemeIcon("symbol-variable");
        const parts: string[] = [];
        if (variable?.version) parts.push(`v${variable.version}`);
        if (variable?.tags && variable.tags.length > 0) {
          parts.push(`[${variable.tags.map((t) => t.name).join(", ")}]`);
        }
        this.description = parts.join(" ");
        this.tooltip = this.createVariableTooltip(variable, false);
        break;
      }

      case "sensitive": {
        this.iconPath = new vscode.ThemeIcon(
          "lock",
          new vscode.ThemeColor("charts.yellow")
        );
        const vTag = variable?.version ? ` v${variable.version}` : "";
        this.description = `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${vTag}`;
        this.tooltip = this.createVariableTooltip(variable, true);
        break;
      }

      case "header":
        this.iconPath = new vscode.ThemeIcon(
          "server-environment",
          new vscode.ThemeColor("charts.blue")
        );
        this.description = description;
        break;

      case "separator":
        this.iconPath = new vscode.ThemeIcon(
          "shield",
          new vscode.ThemeColor("charts.yellow")
        );
        this.description = description;
        break;

      case "message":
        this.iconPath = new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("descriptionForeground")
        );
        this.description = description;
        break;

      case "error":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("errorForeground")
        );
        break;

      case "request":
        this.iconPath = new vscode.ThemeIcon(
          "git-pull-request",
          new vscode.ThemeColor("charts.orange")
        );
        this.description = description;
        this.tooltip = new vscode.MarkdownString(
          `$(git-pull-request) **${label}**\n\nStatus: *${description}*\n\nSubmitted via extension`
        );
        (this.tooltip as vscode.MarkdownString).supportThemeIcons = true;
        break;
    }
  }

  private createVariableTooltip(
    variable?: EnvironmentVariable,
    isSensitive = false
  ): vscode.MarkdownString | undefined {
    if (!variable) return undefined;

    const md = new vscode.MarkdownString("", true);
    md.supportThemeIcons = true;

    md.appendMarkdown(`### $(symbol-variable) ${variable.key}\n\n`);

    if (isSensitive) {
      md.appendMarkdown("$(lock) *Sensitive \u2014 value hidden*\n\n");
    } else {
      md.appendMarkdown(
        "$(cloud-download) *Value synced to your local .env file*\n\n"
      );
    }

    if (variable.description) {
      md.appendMarkdown(`${variable.description}\n\n`);
    }

    md.appendMarkdown("---\n\n");
    md.appendMarkdown(
      `**Environments:** ${variable.environments.join(", ")}  \n`
    );
    md.appendMarkdown(`**Version:** ${variable.version}  \n`);
    if (variable.tags && variable.tags.length > 0) {
      md.appendMarkdown(
        `**Tags:** ${variable.tags.map((t) => t.name).join(", ")}  \n`
      );
    }
    if (isSensitive) {
      md.appendMarkdown("**Sensitive:** $(lock) Yes");
    }

    return md;
  }
}
