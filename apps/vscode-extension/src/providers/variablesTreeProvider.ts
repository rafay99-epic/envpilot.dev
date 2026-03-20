import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import type { EnvironmentVariable, LinkedProjectV2 } from "../types";

export class VariablesTreeProvider implements vscode.TreeDataProvider<VariableTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    VariableTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiService;
  private storage: StorageService;

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
      const variables = await this.api.getVariables(
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

      // Environment & count header
      const role = this.api.getUserRole(linkedProject.projectId);
      const projectRole = this.api.getProjectRole(linkedProject.projectId);

      let roleLabel = "";
      if (role === "admin") {
        roleLabel = " \u00b7 Admin";
      } else if (projectRole) {
        const projectRoleLabels: Record<string, string> = {
          viewer: "Viewer",
          developer: "Developer",
          manager: "Manager",
        };
        roleLabel = ` \u00b7 ${projectRoleLabels[projectRole] || projectRole}`;
      } else if (role) {
        roleLabel = ` \u00b7 ${role === "team_lead" ? "Lead" : "Member"}`;
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

      // Pending requests for members/viewers
      if (role === "member" || projectRole === "viewer") {
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
        const valueStr = this.truncateValue(variable?.value || "");
        const versionTag = variable?.version ? ` v${variable.version}` : "";
        const tagSuffix =
          variable?.tags && variable.tags.length > 0
            ? ` [${variable.tags.map((t) => t.name).join(", ")}]`
            : "";
        this.description = valueStr + versionTag + tagSuffix;
        this.tooltip = this.createVariableTooltip(variable, false);
        break;
      }

      case "sensitive": {
        this.iconPath = new vscode.ThemeIcon(
          "lock",
          new vscode.ThemeColor("charts.yellow")
        );
        const charCount = variable?.value?.length ?? 0;
        const vTag = variable?.version ? ` v${variable.version}` : "";
        this.description =
          charCount > 0
            ? `\u2022\u2022\u2022\u2022\u2022\u2022 (${charCount} chars)${vTag}`
            : `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${vTag}`;
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

  private truncateValue(value: string, maxLength = 40): string {
    if (!value) return "";
    if (value.length <= maxLength) return value;
    return value.substring(0, maxLength) + "\u2026";
  }
}
