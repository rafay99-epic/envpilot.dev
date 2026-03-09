import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import { getDisplayPath } from "../utils/paths";
import type { Project, Organization, LinkedDirectory } from "../types";

export type ProjectTreeItemType =
  | "organization"
  | "project"
  | "linkedProject"
  | "linkedDirectory"
  | "message"
  | "error";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  team_lead: "Lead",
  member: "Member",
};

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
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
              "message"
            ),
          ];
        }

        return this.organizations.map(
          (org) =>
            new ProjectTreeItem(
              org.name,
              vscode.TreeItemCollapsibleState.Collapsed,
              "organization",
              org
            )
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return [
          new ProjectTreeItem(
            `Error: ${message}`,
            vscode.TreeItemCollapsibleState.None,
            "error"
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
              "No projects yet",
              vscode.TreeItemCollapsibleState.None,
              "message"
            ),
          ];
        }

        const linkedProjectsV2 = await this.storage.getLinkedProjectsV2();

        return projects.map((project) => {
          const linkedV2 = linkedProjectsV2.find(
            (lp) => lp.projectId === project._id
          );

          if (linkedV2) {
            return new ProjectTreeItem(
              project.name,
              vscode.TreeItemCollapsibleState.Expanded,
              "linkedProject",
              element.organization,
              project,
              element.organization!.name
            );
          }

          return new ProjectTreeItem(
            project.name,
            vscode.TreeItemCollapsibleState.None,
            "project",
            element.organization,
            project,
            element.organization!.name
          );
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return [
          new ProjectTreeItem(
            `Error: ${message}`,
            vscode.TreeItemCollapsibleState.None,
            "error"
          ),
        ];
      }
    }

    // Linked project level - show directories
    if (element.type === "linkedProject" && element.project) {
      const linkedProject = await this.storage.getLinkedProjectV2(
        element.project._id
      );

      if (!linkedProject || linkedProject.directories.length === 0) {
        return [
          new ProjectTreeItem(
            "No directories linked",
            vscode.TreeItemCollapsibleState.None,
            "message"
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
            dir
          )
      );
    }

    return [];
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
    directory?: LinkedDirectory
  ) {
    super(label, collapsibleState);
    this.type = type;
    this.organization = organization;
    this.project = project;
    this.organizationName = organizationName;
    this.directory = directory;
    this.contextValue = type;

    switch (type) {
      case "organization":
        this.iconPath = new vscode.ThemeIcon(
          "organization",
          organization?.tier === "pro"
            ? new vscode.ThemeColor("charts.green")
            : undefined
        );
        this.description = this.buildOrgDescription(organization);
        this.tooltip = this.createOrgTooltip(organization);
        break;

      case "project":
        this.iconPath = new vscode.ThemeIcon("symbol-package");
        this.description = project?.description || undefined;
        this.tooltip = this.createProjectTooltip(project, false);
        break;

      case "linkedProject":
        this.iconPath = new vscode.ThemeIcon(
          "symbol-package",
          new vscode.ThemeColor("charts.green")
        );
        this.description = "Linked";
        this.tooltip = this.createProjectTooltip(project, true);
        break;

      case "linkedDirectory": {
        const staleness = this.getSyncStaleness(directory);
        this.iconPath = new vscode.ThemeIcon(
          "folder-opened",
          staleness === "fresh"
            ? new vscode.ThemeColor("charts.green")
            : staleness === "stale"
              ? new vscode.ThemeColor("charts.yellow")
              : undefined
        );
        this.description = this.buildDirectoryDescription(directory);
        this.tooltip = this.createDirectoryTooltip(directory);
        break;
      }

      case "message":
        this.iconPath = new vscode.ThemeIcon(
          "info",
          new vscode.ThemeColor("descriptionForeground")
        );
        break;

      case "error":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("errorForeground")
        );
        break;
    }
  }

  private buildOrgDescription(org?: Organization): string | undefined {
    if (!org) return undefined;
    const parts: string[] = [];
    parts.push(org.tier === "pro" ? "Pro" : "Free");
    if (org.role) {
      parts.push(ROLE_LABELS[org.role] || org.role);
    }
    return parts.join(" \u00b7 ");
  }

  private buildDirectoryDescription(dir?: LinkedDirectory): string | undefined {
    if (!dir) return undefined;
    return `${dir.environments.join(", ")} \u2192 ${dir.targetFile}`;
  }

  private createOrgTooltip(
    org?: Organization
  ): vscode.MarkdownString | undefined {
    if (!org) return undefined;
    const md = new vscode.MarkdownString("", true);
    md.supportThemeIcons = true;
    md.appendMarkdown(`### $(organization) ${org.name}\n\n`);
    md.appendMarkdown(
      `**Tier:** ${org.tier === "pro" ? "$(star-full) Pro" : "Free"}\n\n`
    );
    if (org.role) {
      md.appendMarkdown(
        `**Your Role:** ${ROLE_LABELS[org.role] || org.role}\n\n`
      );
    }
    md.appendMarkdown(`**Slug:** \`${org.slug}\``);
    return md;
  }

  private createProjectTooltip(
    project?: Project,
    isLinked?: boolean
  ): vscode.MarkdownString | undefined {
    if (!project) return undefined;
    const md = new vscode.MarkdownString("", true);
    md.supportThemeIcons = true;
    md.appendMarkdown(
      `### ${project.icon || "$(symbol-package)"} ${project.name}\n\n`
    );
    if (isLinked) {
      md.appendMarkdown("$(check) **Linked to this workspace**\n\n");
    }
    if (project.description) {
      md.appendMarkdown(`${project.description}\n\n`);
    }
    md.appendMarkdown(`**Slug:** \`${project.slug}\``);
    return md;
  }

  private getSyncStaleness(dir?: LinkedDirectory): "fresh" | "stale" | "never" {
    if (!dir?.lastSyncedAt) return "never";
    const ageMs = Date.now() - dir.lastSyncedAt;
    return ageMs < 3600000 ? "fresh" : "stale";
  }

  private createDirectoryTooltip(
    directory?: LinkedDirectory
  ): vscode.MarkdownString | undefined {
    if (!directory) return undefined;
    const md = new vscode.MarkdownString("", true);
    md.supportThemeIcons = true;
    md.appendMarkdown(
      `### $(folder-opened) ${directory.displayName || "Directory"}\n\n`
    );
    md.appendMarkdown(`**Path:** \`${directory.directoryPath}\`\n\n`);
    md.appendMarkdown(`**Target:** \`${directory.targetFile}\`\n\n`);
    md.appendMarkdown(
      `**Environments:** ${directory.environments.join(", ")}\n\n`
    );
    md.appendMarkdown("---\n\n");
    if (directory.lastSyncedAt) {
      md.appendMarkdown(
        `$(sync) Last synced ${new Date(directory.lastSyncedAt).toLocaleString()}`
      );
    } else {
      md.appendMarkdown("$(sync) Never synced");
    }
    return md;
  }
}
