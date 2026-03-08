import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import { getDisplayPath, normalizePath } from "../utils/paths";
import type {
  Project,
  Organization,
  LinkedProject,
  LinkedDirectory,
} from "../types";

export type ProjectTreeItemType =
  | "organization"
  | "project"
  | "linkedProject"
  | "linkedDirectory"
  | "message"
  | "error";

export class ProjectsTreeProvider
  implements vscode.TreeDataProvider<ProjectTreeItem>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ProjectTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiService;
  private storage: StorageService;
  private organizations: Organization[] = [];
  private projects: Map<string, Project[]> = new Map();
  private isAuthenticated = false;

  constructor(api: ApiService, storage: StorageService) {
    this.api = api;
    this.storage = storage;
  }

  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!this.isAuthenticated) {
      // Return empty so the viewsWelcome content shows instead
      return [];
    }

    // Root level - show organizations
    if (!element) {
      try {
        this.organizations = await this.api.getOrganizations();

        if (this.organizations.length === 0) {
          return [
            new ProjectTreeItem(
              "No organizations found",
              vscode.TreeItemCollapsibleState.None,
              "message",
            ),
          ];
        }

        return this.organizations.map(
          (org) =>
            new ProjectTreeItem(
              org.name,
              vscode.TreeItemCollapsibleState.Collapsed,
              "organization",
              org,
            ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return [
          new ProjectTreeItem(
            `Error: ${message}`,
            vscode.TreeItemCollapsibleState.None,
            "error",
          ),
        ];
      }
    }

    // Organization level - show projects
    if (element.type === "organization" && element.organization) {
      try {
        const projects = await this.api.getProjects(element.organization._id);
        this.projects.set(element.organization._id, projects);

        if (projects.length === 0) {
          return [
            new ProjectTreeItem(
              "No projects",
              vscode.TreeItemCollapsibleState.None,
              "message",
            ),
          ];
        }

        // Get V2 linked projects
        const linkedProjectsV2 = await this.storage.getLinkedProjectsV2();

        return projects.map((project) => {
          // Check if linked via V2
          const linkedV2 = linkedProjectsV2.find(
            (lp) => lp.projectId === project._id,
          );

          if (linkedV2) {
            return new ProjectTreeItem(
              project.name,
              vscode.TreeItemCollapsibleState.Expanded,
              "linkedProject",
              element.organization,
              project,
              element.organization!.name,
            );
          }

          return new ProjectTreeItem(
            project.name,
            vscode.TreeItemCollapsibleState.None,
            "project",
            element.organization,
            project,
            element.organization!.name,
          );
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return [
          new ProjectTreeItem(
            `Error: ${message}`,
            vscode.TreeItemCollapsibleState.None,
            "error",
          ),
        ];
      }
    }

    // Linked project level - show directories
    if (element.type === "linkedProject" && element.project) {
      const linkedProject = await this.storage.getLinkedProjectV2(
        element.project._id,
      );

      if (!linkedProject || linkedProject.directories.length === 0) {
        return [
          new ProjectTreeItem(
            "No directories linked",
            vscode.TreeItemCollapsibleState.None,
            "message",
          ),
        ];
      }

      return linkedProject.directories.map(
        (dir) =>
          new ProjectTreeItem(
            dir.displayName || getDisplayPath(dir.directoryPath),
            vscode.TreeItemCollapsibleState.None,
            "linkedDirectory",
            element.organization,
            element.project,
            element.organizationName,
            dir,
          ),
      );
    }

    return [];
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

export class ProjectTreeItem extends vscode.TreeItem {
  type: ProjectTreeItemType;
  organization?: Organization;
  project?: Project;
  organizationName?: string;
  directory?: LinkedDirectory;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: ProjectTreeItemType,
    organization?: Organization,
    project?: Project,
    organizationName?: string,
    directory?: LinkedDirectory,
  ) {
    super(label, collapsibleState);
    this.type = type;
    this.organization = organization;
    this.project = project;
    this.organizationName = organizationName;
    this.directory = directory;

    // Set context value for menu filtering
    this.contextValue = type;

    // Set icons and descriptions
    switch (type) {
      case "organization":
        this.iconPath = new vscode.ThemeIcon("organization");
        this.description = organization?.tier === "pro" ? "Pro" : "Free";
        break;
      case "project":
        this.iconPath = new vscode.ThemeIcon("folder");
        this.description = project?.description || undefined;
        break;
      case "linkedProject":
        this.iconPath = new vscode.ThemeIcon("link");
        this.description = "Linked";
        break;
      case "linkedDirectory":
        this.iconPath = new vscode.ThemeIcon("folder-opened");
        this.description = directory?.environments.join(", ");
        this.tooltip = this.createDirectoryTooltip(directory);
        break;
      case "message":
        this.iconPath = new vscode.ThemeIcon("info");
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error");
        break;
    }
  }

  private createDirectoryTooltip(
    directory?: LinkedDirectory,
  ): vscode.MarkdownString | undefined {
    if (!directory) return undefined;

    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**${directory.displayName || "Directory"}**\n\n`);
    tooltip.appendMarkdown(`**Path:** \`${directory.directoryPath}\`\n\n`);
    tooltip.appendMarkdown(`**Target File:** ${directory.targetFile}\n\n`);
    tooltip.appendMarkdown(
      `**Environments:** ${directory.environments.join(", ")}\n\n`,
    );

    if (directory.lastSyncedAt) {
      tooltip.appendMarkdown(
        `**Last Synced:** ${new Date(directory.lastSyncedAt).toLocaleString()}`,
      );
    } else {
      tooltip.appendMarkdown("**Last Synced:** Never");
    }

    return tooltip;
  }
}
