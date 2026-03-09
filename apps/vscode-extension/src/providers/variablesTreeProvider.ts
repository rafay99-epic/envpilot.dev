import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import type { EnvironmentVariable, LinkedProject } from "../types";

export class VariablesTreeProvider implements vscode.TreeDataProvider<VariableTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    VariableTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiService;
  private storage: StorageService;
  private variables: EnvironmentVariable[] = [];

  constructor(api: ApiService, storage: StorageService) {
    this.api = api;
    this.storage = storage;
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: VariableTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: VariableTreeItem): Promise<VariableTreeItem[]> {
    if (element) {
      return [];
    }

    const linkedProject = await this.getLinkedProject();
    if (!linkedProject) {
      return [];
    }

    try {
      this.variables = await this.api.getVariables(
        linkedProject.projectId,
        linkedProject.environment,
        linkedProject.accessToken
      );

      if (this.variables.length === 0) {
        return [
          new VariableTreeItem(
            "No variables",
            vscode.TreeItemCollapsibleState.None,
            "message",
            undefined,
            `No variables for ${linkedProject.environment}`
          ),
        ];
      }

      const regularVars = this.variables.filter((v) => !v.isSensitive);
      const sensitiveVars = this.variables.filter((v) => v.isSensitive);

      const items: VariableTreeItem[] = [];

      // Environment & count header
      const role = this.api.getUserRole(linkedProject.projectId);
      const roleLabel = role
        ? ` \u00b7 ${role === "admin" ? "Admin" : role === "team_lead" ? "Lead" : "Member"}`
        : "";
      items.push(
        new VariableTreeItem(
          linkedProject.environment,
          vscode.TreeItemCollapsibleState.None,
          "header",
          undefined,
          `${this.variables.length} variable${this.variables.length !== 1 ? "s" : ""}${roleLabel}`
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

      // Pending requests for members
      if (role === "member") {
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

  private async getLinkedProject(): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return null;
    }
    return await this.storage.getLinkedProjectForWorkspace(workspacePath);
  }

  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }

  dispose(): void {
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
  | "request";

export class VariableTreeItem extends vscode.TreeItem {
  type: VariableTreeItemType;
  variable?: EnvironmentVariable;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: VariableTreeItemType,
    variable?: EnvironmentVariable,
    description?: string
  ) {
    super(label, collapsibleState);
    this.type = type;
    this.variable = variable;
    this.contextValue = type;

    switch (type) {
      case "variable":
        this.iconPath = new vscode.ThemeIcon("symbol-variable");
        this.description = this.truncateValue(variable?.value || "");
        this.tooltip = this.createVariableTooltip(variable, false);
        break;

      case "sensitive":
        this.iconPath = new vscode.ThemeIcon(
          "lock",
          new vscode.ThemeColor("charts.yellow")
        );
        this.description = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
        this.tooltip = this.createVariableTooltip(variable, true);
        break;

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
      md.appendCodeblock(variable.value, "properties");
      md.appendMarkdown("\n");
    }

    if (variable.description) {
      md.appendMarkdown(`${variable.description}\n\n`);
    }

    md.appendMarkdown("---\n\n");
    md.appendMarkdown(
      `**Environments:** ${variable.environments.join(", ")}  \n`
    );
    md.appendMarkdown(`**Version:** ${variable.version}  \n`);
    if (isSensitive) {
      md.appendMarkdown("**Sensitive:** $(lock) Yes");
    }

    return md;
  }

  private truncateValue(value: string, maxLength = 40): string {
    if (!value) return "";
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + "\u2026";
  }
}
