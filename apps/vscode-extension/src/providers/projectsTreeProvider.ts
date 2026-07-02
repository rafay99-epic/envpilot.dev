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

/** Coalesce rapid-fire refresh() calls into a single tree-data event. */
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
    this.refresh();
  }

  /**
   * Requests a tree refresh. Multiple calls within REFRESH_DEBOUNCE_MS are
   * coalesced into a single `onDidChangeTreeData` event — link/unlink,
   * add/remove-directory, and auth-state changes can each fire several
   * refreshes back-to-back for one user action, and every fire() makes VS
   * Code re-invoke getChildren for the root and every expanded node.
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

        // Fetch usage data for all orgs in parallel (non-blocking)
        const usageResults = await Promise.allSettled(
          this.organizations.map((org) => this.api.getUsage(org._id))
        );
        for (let i = 0; i < this.organizations.length; i++) {
          const result = usageResults[i];
          if (result.status === "fulfilled" && result.value) {
            this.usageCache.set(this.organizations[i]._id, result.value);
          }
        }

        return this.organizations.map(
          (org) =>
            new ProjectTreeItem(
              org.name,
              vscode.TreeItemCollapsibleState.Collapsed,
              "organization",
              org,
              undefined,
              undefined,
              undefined,
              this.usageCache.get(org._id)
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
  usage?: UsageInfo;

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: ProjectTreeItemType,
    organization?: Organization,
    project?: Project,
    organizationName?: string,
    directory?: LinkedDirectory,
    usage?: UsageInfo
  ) {
    super(label, collapsibleState);
    this.type = type;
    this.organization = organization;
    this.project = project;
    this.organizationName = organizationName;
    this.directory = directory;
    this.usage = usage;
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
        this.tooltip = this.createOrgTooltip(organization, usage);
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
    // Prefer the unified role once the server sends it; fall back to the
    // legacy string. Either way, run it through formatRoleLabel \u2014 never
    // compare/display raw "admin"/"member" strings directly.
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
    // Prefer the unified role; fall back to the legacy org role for this
    // project. Legacy "viewer" project role means grant-only / not assigned
    // \u2014 formatRoleLabel only knows org-level tiers, so annotate that here.
    const roleSource = project.unifiedRole ?? project.userRole;
    if (roleSource || project.projectRole) {
      let label = formatRoleLabel(roleSource);
      if (project.projectRole === "viewer") {
        label += " (view-only)";
      }
      parts.push(label);
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

  private formatUsageRatio(current: number, limit: number | null): string {
    if (limit === null) return `${current} / unlimited`;
    return `${current} / ${limit}`;
  }

  private createOrgTooltip(
    org?: Organization,
    usage?: UsageInfo
  ): vscode.MarkdownString | undefined {
    if (!org) return undefined;
    const md = new vscode.MarkdownString("", true);
    md.supportThemeIcons = true;
    md.appendMarkdown(`### $(organization) ${org.name}\n\n`);
    md.appendMarkdown(
      `**Tier:** ${org.tier === "pro" ? "$(star-full) Pro" : "Free"}\n\n`
    );
    if (org.unifiedRole || org.role) {
      md.appendMarkdown(
        `**Your Role:** ${formatRoleLabel(org.unifiedRole ?? org.role)}\n\n`
      );
    }
    md.appendMarkdown(`**Slug:** \`${org.slug}\`\n\n`);

    // Usage data
    if (usage) {
      md.appendMarkdown("---\n\n");

      if (!usage.enforcementEnabled) {
        md.appendMarkdown("$(info) *Pre-alpha — all limits bypassed*\n\n");
      }

      md.appendMarkdown("**Usage**\n\n");
      md.appendMarkdown(
        `- Projects: ${this.formatUsageRatio(usage.usage.projects, usage.limits.projects)}\n`
      );
      md.appendMarkdown(
        `- Team Members: ${this.formatUsageRatio(usage.usage.teamMembers, usage.limits.teamMembers)}\n`
      );
      md.appendMarkdown(
        `- Variables (max): ${this.formatUsageRatio(usage.usage.maxVariablesInProject, usage.limits.variablesPerProject)}\n`
      );
      md.appendMarkdown(`- Total Variables: ${usage.usage.totalVariables}\n\n`);

      md.appendMarkdown("**Features**\n\n");
      const check = "$(check)";
      const x = "$(x)";
      md.appendMarkdown(
        `- Version History: ${usage.features.versionHistory ? check : x}\n`
      );
      md.appendMarkdown(
        `- Bulk Import: ${usage.features.bulkImport ? check : x}\n`
      );
      md.appendMarkdown(
        `- Granular Permissions: ${usage.features.granularPermissions ? check : x}\n`
      );
      md.appendMarkdown(
        `- Audit Retention: ${usage.features.auditLogRetentionDays} days\n`
      );
    }

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
    md.appendMarkdown(`**Slug:** \`${project.slug}\`\n\n`);

    // Unified role + description — keyed off the normalized label (never a
    // raw legacy string), with the legacy "viewer" project role folded in
    // as a view-only annotation since formatRoleLabel can't express
    // assigned-vs-grant-only on its own.
    const roleSource = project.unifiedRole ?? project.userRole;
    if (roleSource || project.projectRole) {
      const label = formatRoleLabel(roleSource);
      const isViewOnly = project.projectRole === "viewer";
      const roleDescriptions: Record<string, string> = {
        Owner: "$(shield) Owner (full access)",
        "Project Manager":
          "Project Manager (manage members, variables, and permissions)",
        "Team Lead": "Team Lead (manage members, variables, and permissions)",
        Developer: isViewOnly
          ? "Developer — view-only (view explicitly permitted variables only)"
          : "Developer (view and edit variables)",
      };
      md.appendMarkdown(
        `**Your Role:** ${roleDescriptions[label] || label}\n\n`
      );
      if (
        project.environmentScope &&
        project.environmentScope.length > 0 &&
        label === "Developer"
      ) {
        md.appendMarkdown(
          `**Scoped to:** ${project.environmentScope.join(", ")}\n\n`
        );
      }
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
