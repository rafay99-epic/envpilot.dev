import * as vscode from "vscode";
import { ApiService } from "../services/api";
import { StorageService } from "../utils/storage";
import { getDisplayPath } from "../utils/paths";
import { formatRoleLabel } from "../roles";
import type {
  Project,
  Organization,
  LinkedDirectory,
  UsageInfo,
} from "../types";

export type ProjectTreeItemType =
  | "organization"
  | "project"
  | "linkedProject"
  | "linkedDirectory"
  | "message"
  | "error";

const REFRESH_DEBOUNCE_MS = 150;

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    ProjectTreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private api: ApiService;
  private storage: StorageService;
  private organizations: Organization[] = [];
  private projects: Map<string, Project[]> = new Map();
  private usageCache: Map<string, UsageInfo> = new Map();
  private isAuthenticated = false;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(api: ApiService, storage: StorageService) {
    this.api = api;
    this.storage = storage;
  }

  setAuthenticated(authenticated: boolean): void {
    this.isAuthenticated = authenticated;
    this.usageCache.clear();
    this.refresh();
  }

  refresh(): void {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      this._onDidChangeTreeData.fire();
    }, REFRESH_DEBOUNCE_MS);
  }

  getTreeItem(element: ProjectTreeItem): vscode.TreeItem {
    return element;
  }

  async resolveTreeItem(
    item: vscode.TreeItem,
    element: ProjectTreeItem
  ): Promise<vscode.TreeItem> {
    const org = element.organization;
    if (element.type !== "organization" || !org) return item;
    let usage = this.usageCache.get(org._id);
    if (!usage) {
      usage = (await this.api.getUsage(org._id)) ?? undefined;
      if (usage) this.usageCache.set(org._id, usage);
    }
    item.tooltip = createOrgTooltip(org, usage);
    return item;
  }

  async getChildren(element?: ProjectTreeItem): Promise<ProjectTreeItem[]> {
    if (!this.isAuthenticated) {
      return [];
    }

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

        return projects.map((listed) => {
          const project = {
            ...listed,
            hasWriteAccess: this.api.getAccessMeta(listed._id)?.hasWriteAccess,
          };
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
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
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
        break;

      case "project":
        this.iconPath = new vscode.ThemeIcon("symbol-package");
        this.description = this.buildProjectDescription(project, false);
        this.tooltip = this.createProjectTooltip(project, false);
        break;

      case "linkedProject":
        this.iconPath = new vscode.ThemeIcon(
          "symbol-package",
          new vscode.ThemeColor("charts.green")
        );
        this.description = this.buildProjectDescription(project, true);
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
    if (org.unifiedRole || org.role) {
      parts.push(formatRoleLabel(org.unifiedRole ?? org.role));
    }
    return parts.join(" \u00b7 ");
  }

  private buildProjectDescription(
    project?: Project,
    isLinked?: boolean
  ): string | undefined {
    if (!project) return undefined;
    const parts: string[] = [];
    if (isLinked) {
      parts.push("Linked");
    }
    const roleSource = project.unifiedRole ?? project.userRole;
    if (roleSource) {
      parts.push(
        project.hasWriteAccess === false
          ? `${formatRoleLabel(roleSource)} (read-only)`
          : formatRoleLabel(roleSource)
      );
    }
    if (parts.length === 0 && project.description) {
      return project.description;
    }
    return parts.join(" \u00b7 ") || project.description || undefined;
  }

  private buildDirectoryDescription(dir?: LinkedDirectory): string | undefined {
    if (!dir) return undefined;
    return `${dir.environments.join(", ")} \u2192 ${dir.targetFile}`;
  }

  private createProjectTooltip(
    project?: Project,
    isLinked?: boolean
  ): vscode.MarkdownString | undefined {
    if (!project) return undefined;
    const md = new vscode.MarkdownString("", true);
    md.appendMarkdown("### $(symbol-package) ");
    md.appendText(project.name);
    md.appendMarkdown("\n\n");
    if (isLinked) {
      md.appendMarkdown("$(check) **Linked to this workspace**\n\n");
    }
    if (project.description) {
      md.appendText(project.description);
      md.appendMarkdown("\n\n");
    }
    md.appendMarkdown("**Slug:** ");
    md.appendText(project.slug);
    md.appendMarkdown("\n\n");

    const roleSource = project.unifiedRole ?? project.userRole;
    if (roleSource) {
      md.appendMarkdown("**Your Role:** ");
      md.appendText(formatRoleLabel(roleSource));
      if (project.hasWriteAccess === false) md.appendMarkdown(" (read-only)");
      md.appendMarkdown("\n\n");
    }
    if (project.environmentScope && project.environmentScope.length > 0) {
      md.appendMarkdown("**Scoped to:** ");
      md.appendText(project.environmentScope.join(", "));
      md.appendMarkdown("\n\n");
    }
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
    md.appendMarkdown("### $(folder-opened) ");
    md.appendText(directory.displayName || "Directory");
    md.appendMarkdown("\n\n**Path:** ");
    md.appendText(directory.directoryPath);
    md.appendMarkdown("\n\n**Target:** ");
    md.appendText(directory.targetFile);
    md.appendMarkdown("\n\n**Environments:** ");
    md.appendText(directory.environments.join(", "));
    md.appendMarkdown("\n\n---\n\n");
    md.appendMarkdown(
      directory.lastSyncedAt
        ? `$(sync) Last synced ${new Date(directory.lastSyncedAt).toLocaleString()}`
        : "$(sync) Never synced"
    );
    return md;
  }
}

function formatUsageRatio(current: number, limit: number | null): string {
  return `${current} / ${limit ?? "unlimited"}`;
}

function createOrgTooltip(
  org: Organization,
  usage?: UsageInfo
): vscode.MarkdownString {
  const md = new vscode.MarkdownString("", true);
  md.appendMarkdown("### $(organization) ");
  md.appendText(org.name);
  md.appendMarkdown(
    `\n\n**Tier:** ${org.tier === "pro" ? "$(star-full) Pro" : "Free"}\n\n`
  );
  if (org.unifiedRole || org.role) {
    md.appendMarkdown("**Your Role:** ");
    md.appendText(formatRoleLabel(org.unifiedRole ?? org.role));
    md.appendMarkdown("\n\n");
  }
  md.appendMarkdown("**Slug:** ");
  md.appendText(org.slug);
  md.appendMarkdown("\n\n");

  if (usage) {
    md.appendMarkdown("---\n\n");
    if (!usage.enforcementEnabled) {
      md.appendMarkdown("$(info) *Pre-alpha: all limits bypassed*\n\n");
    }
    md.appendMarkdown(
      [
        "**Usage**",
        "",
        `- Projects: ${formatUsageRatio(usage.usage.projects, usage.limits.projects)}`,
        `- Team Members: ${formatUsageRatio(usage.usage.teamMembers, usage.limits.teamMembers)}`,
        `- Variables (max): ${formatUsageRatio(usage.usage.maxVariablesInProject, usage.limits.variablesPerProject)}`,
        `- Total Variables: ${usage.usage.totalVariables}`,
        "",
        "**Features**",
        "",
        `- Version History: ${usage.features.versionHistory ? "$(check)" : "$(x)"}`,
        `- Bulk Import: ${usage.features.bulkImport ? "$(check)" : "$(x)"}`,
        `- Granular Permissions: ${usage.features.granularPermissions ? "$(check)" : "$(x)"}`,
        `- Audit Retention: ${usage.features.auditLogRetentionDays} days`,
      ].join("\n")
    );
  }
  return md;
}
