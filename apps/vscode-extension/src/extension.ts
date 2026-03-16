import * as vscode from "vscode";
import { AuthService } from "./services/auth";
import { ApiService } from "./services/api";
import { SyncService } from "./services/sync";
import { RealTimeSyncService } from "./services/realTimeSync";
import { ConvexService } from "./services/convex";
import { StorageService } from "./utils/storage";
import {
  ProjectsTreeProvider,
  ProjectTreeItem,
} from "./providers/projectsTreeProvider";
import { VariablesTreeProvider } from "./providers/variablesTreeProvider";
import { StatusBarProvider } from "./providers/statusBar";
import { LinkProjectDialog } from "./ui/linkProjectDialog";
import { RequestVariableDialog } from "./ui/requestVariableDialog";
import { FileProtectionService } from "./services/fileProtection";
import { ClipboardGuardService } from "./services/clipboardGuard";
import { GitCommitGuardService } from "./services/gitCommitGuard";
import { EnvCodeLensProvider } from "./providers/envCodeLensProvider";
import { DashboardPanelProvider } from "./providers/dashboardPanel";
import { openUrlReliably } from "./utils/browser";
import { initSentry, captureError, closeSentry } from "./utils/sentry";
import { getDeviceInfo } from "./utils/device";
import {
  getServerUrl,
  getConvexUrl,
  shouldAutoSync,
  isCommitGuardEnabled,
} from "./utils/config";
import { getDisplayPath } from "./utils/paths";
import * as output from "./utils/outputChannel";

/* eslint-disable @typescript-eslint/no-explicit-any */
function wrapCommand(
  fn: (...args: any[]) => Promise<any>
): (...args: any[]) => Promise<void> {
  return async (...args: any[]) => {
    /* eslint-enable @typescript-eslint/no-explicit-any */
    try {
      await fn(...args);
    } catch (err) {
      captureError(err);
      const message = err instanceof Error ? err.message : String(err);
      output.error(message);
      vscode.window.showErrorMessage(`Envpilot: ${message}`);
    }
  };
}

let authService: AuthService;
let apiService: ApiService;
let syncService: SyncService;
let realTimeSyncService: RealTimeSyncService;
let convexService: ConvexService | null = null;
let storageService: StorageService;
let fileProtectionService: FileProtectionService;
let clipboardGuardService: ClipboardGuardService;
let gitCommitGuardService: GitCommitGuardService;
let envCodeLensProvider: EnvCodeLensProvider;
let dashboardPanelProvider: DashboardPanelProvider;
let projectsTreeProvider: ProjectsTreeProvider;
let variablesTreeProvider: VariablesTreeProvider;
let statusBarProvider: StatusBarProvider;
let linkProjectDialog: LinkProjectDialog;
let requestVariableDialog: RequestVariableDialog;

/** Update context flags used by menu when-clauses and welcome views */
async function updateContextFlags(): Promise<void> {
  const linkedProject = await syncService.getLinkedProjectV2ForWorkspace();
  vscode.commands.executeCommand(
    "setContext",
    "envpilot.hasLinkedProject",
    !!linkedProject
  );
  if (linkedProject) {
    const role = apiService.getUserRole(linkedProject.projectId);
    const projectRole = apiService.getProjectRole(linkedProject.projectId);
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.userRole",
      role || ""
    );
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.projectRole",
      projectRole || ""
    );
  }
}

/**
 * Initialize the Convex WebSocket service.
 * Tries: 1) envpilot.convexUrl setting, 2) GET /api/extension/config from server.
 */
async function initializeConvexService(): Promise<void> {
  try {
    let convexUrl = getConvexUrl();

    // Auto-detect from server if not configured
    if (!convexUrl) {
      try {
        const axios = (await import("axios")).default;
        const response = await axios.get(
          `${getServerUrl()}/api/extension/config`,
          { timeout: 5000 }
        );
        convexUrl = response.data?.convexUrl || "";
      } catch {
        output.warn("Failed to auto-detect Convex URL from server");
      }
    }

    if (!convexUrl) {
      output.warn("No Convex URL available — WebSocket sync disabled");
      return;
    }

    convexService = new ConvexService(convexUrl);
    syncService.setConvexService(convexService);
    realTimeSyncService.setConvexService(convexService);
    output.log("Convex WebSocket connection initialized");
  } catch (error) {
    output.error(
      `Failed to initialize Convex service: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function activate(context: vscode.ExtensionContext) {
  initSentry();

  // Initialize storage
  storageService = new StorageService(context);

  // Run storage migration if needed
  await storageService.migrateIfNeeded();

  // Initialize services
  authService = new AuthService(context, storageService);
  apiService = new ApiService(storageService);
  fileProtectionService = new FileProtectionService();
  clipboardGuardService = new ClipboardGuardService();
  clipboardGuardService.activate();
  gitCommitGuardService = new GitCommitGuardService();
  syncService = new SyncService(apiService, storageService);
  syncService.setFileProtection(fileProtectionService);
  syncService.setClipboardGuard(clipboardGuardService);
  realTimeSyncService = new RealTimeSyncService(syncService, storageService);

  // Initialize Convex WebSocket connection
  await initializeConvexService();

  // Initialize commit guard if enabled
  if (isCommitGuardEnabled()) {
    await gitCommitGuardService.initialize();

    // Show one-time notification about commit guard
    const guardNotified = context.globalState.get<boolean>(
      "envpilot.commitGuardNotified"
    );
    if (!guardNotified) {
      vscode.window.showInformationMessage(
        "Envpilot: .env commit guard is active. A pre-commit hook has been installed to protect your secrets."
      );
      context.globalState.update("envpilot.commitGuardNotified", true);
    }
  }

  // Initialize UI providers
  projectsTreeProvider = new ProjectsTreeProvider(apiService, storageService);
  variablesTreeProvider = new VariablesTreeProvider(apiService, storageService);
  statusBarProvider = new StatusBarProvider(authService, syncService);
  envCodeLensProvider = new EnvCodeLensProvider(storageService);
  dashboardPanelProvider = new DashboardPanelProvider(
    context.extensionUri,
    authService,
    apiService,
    syncService,
    storageService
  );
  linkProjectDialog = new LinkProjectDialog(syncService);
  requestVariableDialog = new RequestVariableDialog();

  // Register tree views and CodeLens provider
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      "envpilot.projects",
      projectsTreeProvider
    ),
    vscode.window.registerTreeDataProvider(
      "envpilot.variables",
      variablesTreeProvider
    ),
    vscode.languages.registerCodeLensProvider(
      { pattern: "**/.env*" },
      envCodeLensProvider
    )
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "envpilot.signIn",
      wrapCommand(handleSignIn)
    ),
    vscode.commands.registerCommand(
      "envpilot.signOut",
      wrapCommand(handleSignOut)
    ),
    vscode.commands.registerCommand(
      "envpilot.linkProject",
      wrapCommand(handleLinkProject)
    ),
    vscode.commands.registerCommand(
      "envpilot.unlinkProject",
      wrapCommand(handleUnlinkProject)
    ),
    vscode.commands.registerCommand(
      "envpilot.pullVariables",
      wrapCommand(handlePullVariables)
    ),
    vscode.commands.registerCommand(
      "envpilot.refresh",
      wrapCommand(async () => handleRefresh())
    ),
    vscode.commands.registerCommand(
      "envpilot.openDashboard",
      wrapCommand(handleOpenDashboard)
    ),
    vscode.commands.registerCommand(
      "envpilot.showStatus",
      wrapCommand(handleShowStatus)
    ),
    // New V2 commands
    vscode.commands.registerCommand(
      "envpilot.addDirectory",
      wrapCommand(handleAddDirectory)
    ),
    vscode.commands.registerCommand(
      "envpilot.removeDirectory",
      wrapCommand(handleRemoveDirectory)
    ),
    vscode.commands.registerCommand(
      "envpilot.selectEnvironments",
      wrapCommand(handleSelectEnvironments)
    ),
    vscode.commands.registerCommand(
      "envpilot.requestVariable",
      wrapCommand(handleRequestVariable)
    ),
    // Commit guard commands
    vscode.commands.registerCommand(
      "envpilot.installCommitGuard",
      wrapCommand(handleInstallCommitGuard)
    ),
    vscode.commands.registerCommand(
      "envpilot.removeCommitGuard",
      wrapCommand(handleRemoveCommitGuard)
    ),
    // Dashboard panel command
    vscode.commands.registerCommand(
      "envpilot.openDashboardPanel",
      wrapCommand(async () => {
        dashboardPanelProvider.show();
      })
    )
  );

  // Subscribe to auth state changes
  authService.onAuthStateChanged(async (session) => {
    const authenticated = !!session;
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.isAuthenticated",
      authenticated
    );
    projectsTreeProvider.setAuthenticated(authenticated);
    variablesTreeProvider.refresh();
    statusBarProvider.update();
    dashboardPanelProvider.refresh();
    await updateContextFlags();
  });

  // Check initial auth state
  const isAuthenticated = await authService.isAuthenticated();
  vscode.commands.executeCommand(
    "setContext",
    "envpilot.isAuthenticated",
    isAuthenticated
  );
  projectsTreeProvider.setAuthenticated(isAuthenticated);

  // Start reactive sync if authenticated and auto-sync enabled
  if (isAuthenticated && shouldAutoSync()) {
    syncService.startPeriodicSync();
    realTimeSyncService.startRealTimeSync();

    const linkedProject = await syncService.getLinkedProjectV2ForWorkspace();
    if (linkedProject) {
      syncService.syncAllDirectories(linkedProject);
    }

    await updateContextFlags();
  }

  // Subscribe to real-time revocation events for UI updates
  realTimeSyncService.onRevocationDetected(({ project, reason }) => {
    projectsTreeProvider.refresh();
    variablesTreeProvider.refresh();
    statusBarProvider.update();
    dashboardPanelProvider.refresh();

    output.log(`Revocation detected for ${project.projectName}: ${reason}`);
  });

  // Refresh CodeLens and dashboard when sync completes
  syncService.onSyncComplete(() => {
    envCodeLensProvider.refresh();
    dashboardPanelProvider.notifySyncCompleted();
  });

  // Listen for workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      variablesTreeProvider.refresh();
      statusBarProvider.update();
      dashboardPanelProvider.refresh();
    })
  );

  // Add cleanup to subscriptions
  context.subscriptions.push({
    dispose: () => {
      authService.dispose();
      syncService.dispose();
      realTimeSyncService.dispose();
      convexService?.dispose();
      fileProtectionService.dispose();
      clipboardGuardService.dispose();
      gitCommitGuardService.dispose();
      envCodeLensProvider.dispose();
      dashboardPanelProvider.dispose();
      projectsTreeProvider.dispose();
      variablesTreeProvider.dispose();
      statusBarProvider.dispose();
      output.dispose();
    },
  });
}

async function handleSignIn(): Promise<void> {
  const success = await authService.signIn();
  if (success) {
    // Show progress while loading initial data
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Envpilot: Setting up...",
      },
      async (progress) => {
        progress.report({ message: "Loading projects and variables..." });
        projectsTreeProvider.refresh();
        variablesTreeProvider.refresh();

        if (shouldAutoSync()) {
          progress.report({ message: "Starting sync..." });
          syncService.startPeriodicSync();
          realTimeSyncService.startRealTimeSync();
        }
      }
    );
  }
}

async function handleSignOut(): Promise<void> {
  await authService.signOut();
  syncService.stopPeriodicSync();
  realTimeSyncService.stopRealTimeSync();
  projectsTreeProvider.refresh();
  variablesTreeProvider.refresh();
}

async function handleLinkProject(item?: ProjectTreeItem): Promise<void> {
  const isAuthenticated = await authService.isAuthenticated();
  if (!isAuthenticated) {
    const shouldSignIn = await vscode.window.showWarningMessage(
      "You need to sign in to link a project.",
      "Sign In"
    );
    if (shouldSignIn === "Sign In") {
      await handleSignIn();
    }
    return;
  }

  let projectId: string;
  let projectName: string;
  let organizationId: string;
  let organizationName: string;
  let project:
    | { _id: string; name: string; description: string | null }
    | undefined;
  let organization:
    | { _id: string; name: string; tier: "free" | "pro" }
    | undefined;

  if (item?.project) {
    projectId = item.project._id;
    projectName = item.project.name;
    organizationId =
      item.organization?._id || item.project.organizationId || "";
    organizationName = item.organizationName || "Unknown";
    project = item.project;
    organization = item.organization;

    // Fallback: if organization is missing from the tree item, resolve it from
    // the project's organizationId via the organizations API
    if (!organization && item.project.organizationId) {
      const orgs = await apiService.getOrganizations();
      organization = orgs.find(
        (org) => org._id === item.project!.organizationId
      );
      if (organization) {
        organizationName = organization.name;
      }
    }
  } else {
    // Show project picker
    const organizations = await apiService.getOrganizations();

    if (organizations.length === 0) {
      vscode.window.showWarningMessage("No organizations found");
      return;
    }

    // Pick organization
    const orgPick = await vscode.window.showQuickPick(
      organizations.map((org) => ({
        label: org.name,
        description: org.tier === "pro" ? "Pro" : "Free",
        organization: org,
      })),
      { placeHolder: "Select an organization" }
    );

    if (!orgPick) {
      return;
    }

    // Check tier access
    const accessCheck = await apiService.checkExtensionAccess(
      orgPick.organization._id
    );
    if (!accessCheck.enabled) {
      vscode.window.showWarningMessage(
        accessCheck.reason || "Extension access requires Pro tier"
      );
      return;
    }

    // Get projects
    const projects = await apiService.getProjects(orgPick.organization._id);

    if (projects.length === 0) {
      vscode.window.showWarningMessage(
        "No projects found in this organization"
      );
      return;
    }

    // Pick project
    const projectPick = await vscode.window.showQuickPick(
      projects.map((p) => ({
        label: p.name,
        description: p.description || undefined,
        project: p,
      })),
      { placeHolder: "Select a project to link" }
    );

    if (!projectPick) {
      return;
    }

    projectId = projectPick.project._id;
    projectName = projectPick.project.name;
    organizationId = orgPick.organization._id;
    organizationName = orgPick.organization.name;
    project = projectPick.project;
    organization = orgPick.organization;
  }

  // Check if project is already linked
  const existingProject = await storageService.getLinkedProjectV2(projectId);

  if (existingProject) {
    // Show option to add another directory
    const choice = await vscode.window.showInformationMessage(
      `"${projectName}" is already linked. Add another directory?`,
      "Add Directory",
      "Cancel"
    );

    if (choice === "Add Directory") {
      const linkOptions =
        await linkProjectDialog.showAddDirectoryDialog(projectName);
      if (!linkOptions) return;

      try {
        await syncService.addDirectoryToProject(existingProject, linkOptions);

        vscode.window.showInformationMessage(
          `Added ${getDisplayPath(linkOptions.directoryPath)} to ${projectName}`
        );

        projectsTreeProvider.refresh();
        variablesTreeProvider.refresh();
        statusBarProvider.update();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Failed to add directory: ${message}`);
      }
    }
    return;
  }

  // Show link dialog for new project
  if (!project || !organization) {
    vscode.window.showErrorMessage("Project or organization not found");
    return;
  }

  const projectForDialog = {
    _id: projectId,
    name: projectName,
    slug: projectName.toLowerCase().replace(/\s+/g, "-"),
    description: project.description || null,
    organizationId: organization._id,
    icon: null,
    color: null,
  };

  const organizationForDialog = {
    _id: organization._id,
    name: organizationName,
    slug: organizationName.toLowerCase().replace(/\s+/g, "-"),
    tier: organization.tier,
  };

  const linkOptions = await linkProjectDialog.showLinkDialog(
    projectForDialog,
    organizationForDialog
  );
  if (!linkOptions) return;

  // Link the extension
  try {
    const deviceInfo = await getDeviceInfo(storageService.getContext());
    const access = await apiService.linkExtension(projectId, deviceInfo);

    await syncService.linkProjectWithDirectory(
      projectId,
      projectName,
      organizationId,
      organizationName,
      access.accessToken,
      access.expiresAt,
      linkOptions
    );

    vscode.window.showInformationMessage(
      `Linked ${getDisplayPath(linkOptions.directoryPath)} to ${projectName}`
    );
    projectsTreeProvider.refresh();
    variablesTreeProvider.refresh();
    statusBarProvider.update();
    await updateContextFlags();

    // Refresh WebSocket subscriptions to include new project
    await realTimeSyncService.refreshSubscriptions();
    await syncService.refreshSubscriptions();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`Failed to link project: ${message}`);
  }
}

async function handleAddDirectory(item?: ProjectTreeItem): Promise<void> {
  const isAuthenticated = await authService.isAuthenticated();
  if (!isAuthenticated) {
    vscode.window.showWarningMessage("Please sign in first");
    return;
  }

  let projectId: string | undefined;
  let projectName: string | undefined;

  if (item?.project) {
    projectId = item.project._id;
    projectName = item.project.name;
  } else {
    // Get linked projects and let user choose
    const linkedProjects = await storageService.getLinkedProjectsV2();
    if (linkedProjects.length === 0) {
      vscode.window.showWarningMessage(
        "No linked projects. Link a project first."
      );
      return;
    }

    const projectPick = await vscode.window.showQuickPick(
      linkedProjects.map((p) => ({
        label: p.projectName,
        description: `${p.directories.length} director${p.directories.length === 1 ? "y" : "ies"} linked`,
        projectId: p.projectId,
      })),
      { placeHolder: "Select a project to add a directory to" }
    );

    if (!projectPick) return;

    projectId = projectPick.projectId;
    projectName = projectPick.label;
  }

  const project = await storageService.getLinkedProjectV2(projectId!);
  if (!project) {
    vscode.window.showWarningMessage("Project not found");
    return;
  }

  const linkOptions = await linkProjectDialog.showAddDirectoryDialog(
    projectName!
  );
  if (!linkOptions) return;

  try {
    await syncService.addDirectoryToProject(project, linkOptions);

    vscode.window.showInformationMessage(
      `Added ${getDisplayPath(linkOptions.directoryPath)} to ${projectName}`
    );

    projectsTreeProvider.refresh();
    variablesTreeProvider.refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`Failed to add directory: ${message}`);
  }
}

async function handleRemoveDirectory(item?: ProjectTreeItem): Promise<void> {
  if (!item?.directory || !item.project) {
    vscode.window.showWarningMessage("Select a directory to remove");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${getDisplayPath(item.directory.directoryPath)}" from ${item.project.name}?`,
    "Remove",
    "Cancel"
  );

  if (confirm !== "Remove") {
    return;
  }

  try {
    await syncService.removeDirectoryFromProject(
      item.project._id,
      item.directory.directoryPath
    );

    vscode.window.showInformationMessage("Directory removed");
    projectsTreeProvider.refresh();
    variablesTreeProvider.refresh();
    statusBarProvider.update();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`Failed to remove directory: ${message}`);
  }
}

async function handleSelectEnvironments(item?: ProjectTreeItem): Promise<void> {
  // This would allow updating which environments sync to a specific directory
  // For now, show a message that this feature requires relinking
  vscode.window.showInformationMessage(
    "To change environments, remove and re-add the directory with different environment settings."
  );
}

async function handleRequestVariable(): Promise<void> {
  const isAuth = await authService.isAuthenticated();
  if (!isAuth) {
    vscode.window.showWarningMessage("Please sign in first");
    return;
  }

  // Get the linked project
  const linkedProject = await syncService.getLinkedProjectV2ForWorkspace();
  if (!linkedProject) {
    vscode.window.showWarningMessage(
      'No project linked. Use "Envpilot: Link Project" first.'
    );
    return;
  }

  // Check role — only members should use this
  const role = apiService.getUserRole(linkedProject.projectId);
  if (role && role !== "member") {
    vscode.window.showInformationMessage(
      "As an admin or team lead, you can create variables directly on the dashboard."
    );
    return;
  }

  // Show the request dialog
  const input = await requestVariableDialog.showRequestDialog(
    linkedProject.projectId
  );
  if (!input) {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Envpilot: Submitting variable request...",
      },
      async () => {
        await apiService.submitVariableRequest(input);
      }
    );
    vscode.window.showInformationMessage(
      `Variable request for "${input.key}" submitted for approval.`
    );
    variablesTreeProvider.refresh();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(
      `Failed to submit variable request: ${message}`
    );
  }
}

async function handleUnlinkProject(item?: ProjectTreeItem): Promise<void> {
  // Try V2 first
  const linkedProjectV2 = await syncService.getLinkedProjectV2ForWorkspace();

  if (linkedProjectV2) {
    const projectId = item?.project?._id || linkedProjectV2.projectId;

    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${linkedProjectV2.projectName}"? This will remove all synced .env files (${linkedProjectV2.directories.length} director${linkedProjectV2.directories.length === 1 ? "y" : "ies"}).`,
      "Unlink",
      "Cancel"
    );

    if (confirm !== "Unlink") {
      return;
    }

    try {
      const deviceInfo = await getDeviceInfo(storageService.getContext());
      await apiService.unlinkExtension(projectId, deviceInfo.deviceId);

      // Clean up all directories
      await syncService.cleanupAllDirectories(linkedProjectV2);
      await storageService.removeLinkedProjectV2(projectId);

      vscode.window.showInformationMessage("Project unlinked");
      projectsTreeProvider.refresh();
      variablesTreeProvider.refresh();
      statusBarProvider.update();
      await updateContextFlags();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      vscode.window.showErrorMessage(`Failed to unlink project: ${message}`);
    }
    return;
  }

  // Fallback to V1
  const linkedProject = await syncService.getLinkedProject();

  if (!linkedProject) {
    vscode.window.showWarningMessage("No project linked to this workspace");
    return;
  }

  const projectId = item?.project?._id || linkedProject.projectId;

  const confirm = await vscode.window.showWarningMessage(
    `Unlink "${linkedProject.projectName}"? This will remove the synced .env file.`,
    "Unlink",
    "Cancel"
  );

  if (confirm !== "Unlink") {
    return;
  }

  try {
    const deviceInfo = await getDeviceInfo(storageService.getContext());
    await apiService.unlinkExtension(projectId, deviceInfo.deviceId);
    await syncService.unlinkProject(projectId);

    vscode.window.showInformationMessage("Project unlinked");
    projectsTreeProvider.refresh();
    variablesTreeProvider.refresh();
    statusBarProvider.update();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    vscode.window.showErrorMessage(`Failed to unlink project: ${message}`);
  }
}

async function handlePullVariables(): Promise<void> {
  const isAuthenticated = await authService.isAuthenticated();
  if (!isAuthenticated) {
    vscode.window.showWarningMessage("Please sign in first");
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Envpilot: Pulling variables...",
    },
    async () => {
      statusBarProvider.setSyncing(true);
      dashboardPanelProvider.notifySyncStarted();

      // Try V2 first
      const linkedProjectV2 =
        await syncService.getLinkedProjectV2ForWorkspace();
      if (linkedProjectV2) {
        const results = await syncService.syncAllDirectories(linkedProjectV2);
        statusBarProvider.setSyncing(false);

        if (results) {
          const successful = results.filter((r) => r.success).length;
          const total = results.length;
          if (successful === total) {
            vscode.window.showInformationMessage(
              `Synced ${successful} director${successful === 1 ? "y" : "ies"}`
            );
          } else {
            vscode.window.showWarningMessage(
              `Synced ${successful}/${total} directories. Some failed.`
            );
          }
          variablesTreeProvider.refresh();
        }
        return;
      }

      // Fallback to V1
      const result = await syncService.syncCurrentWorkspace();

      statusBarProvider.setSyncing(false);

      if (result) {
        variablesTreeProvider.refresh();
      }
    }
  );
}

function handleRefresh(): void {
  projectsTreeProvider.refresh();
  variablesTreeProvider.refresh();
  statusBarProvider.update();
}

async function handleOpenDashboard(): Promise<void> {
  const serverUrl = getServerUrl();
  const opened = await openUrlReliably(serverUrl);
  if (!opened) {
    vscode.window.showInformationMessage(
      "Dashboard URL copied to clipboard. Paste it in your browser."
    );
  }
}

async function handleShowStatus(): Promise<void> {
  const isAuthenticated = await authService.isAuthenticated();

  if (!isAuthenticated) {
    const action = await vscode.window.showInformationMessage(
      "Envpilot: Not signed in",
      "Sign In"
    );
    if (action === "Sign In") {
      await handleSignIn();
    }
    return;
  }

  const user = await authService.getCurrentUser();

  // Try V2 first
  const linkedProjectV2 = await syncService.getLinkedProjectV2ForWorkspace();

  const items: vscode.QuickPickItem[] = [
    {
      label: "$(account) Signed in as",
      description: user?.email || "Unknown",
      alwaysShow: true,
    },
  ];

  if (linkedProjectV2) {
    items.push(
      { kind: vscode.QuickPickItemKind.Separator, label: "Linked Project" },
      {
        label: "$(folder) Project",
        description: linkedProjectV2.projectName,
      },
      {
        label: "$(organization) Organization",
        description: linkedProjectV2.organizationName,
      },
      {
        label: "$(file-directory) Directories",
        description: `${linkedProjectV2.directories.length} linked`,
      }
    );

    for (const dir of linkedProjectV2.directories) {
      items.push({
        label: `  $(folder-opened) ${dir.displayName || getDisplayPath(dir.directoryPath)}`,
        description: `${dir.environments.join(", ")} -> ${dir.targetFile}`,
      });
    }
  } else {
    // Fallback to V1
    const linkedProject = await syncService.getLinkedProject();

    if (linkedProject) {
      items.push(
        { kind: vscode.QuickPickItemKind.Separator, label: "Linked Project" },
        {
          label: "$(folder) Project",
          description: linkedProject.projectName,
        },
        {
          label: "$(organization) Organization",
          description: linkedProject.organizationName,
        },
        {
          label: "$(server-environment) Environment",
          description: linkedProject.environment,
        },
        {
          label: "$(file) Target file",
          description: linkedProject.targetFile,
        },
        {
          label: linkedProject.lastSyncedAt
            ? `$(clock) Last synced: ${new Date(linkedProject.lastSyncedAt).toLocaleString()}`
            : "$(clock) Never synced",
          description: "",
        }
      );
    }
  }

  items.push(
    { kind: vscode.QuickPickItemKind.Separator, label: "Actions" },
    {
      label: "$(sync) Pull Variables",
      description: "Sync variables now",
    },
    {
      label: linkedProjectV2 ? "$(add) Add Directory" : "$(link) Link Project",
      description: linkedProjectV2
        ? "Add another directory"
        : "Connect to a project",
    },
    {
      label: linkedProjectV2 ? "$(link-external) Unlink Project" : "",
      description: linkedProjectV2 ? "Disconnect from project" : "",
    },
    {
      label: "$(globe) Open Dashboard",
      description: "Open Envpilot in browser",
    },
    {
      label: "$(sign-out) Sign Out",
      description: "Sign out of Envpilot",
    }
  );

  // Filter out empty items
  const filteredItems = items.filter((i) => i.label);

  const selected = await vscode.window.showQuickPick(filteredItems, {
    title: "Envpilot Status",
    placeHolder: "Select an action",
  });

  if (!selected) {
    return;
  }

  if (selected.label.includes("Pull Variables")) {
    await handlePullVariables();
  } else if (selected.label.includes("Unlink Project")) {
    await handleUnlinkProject();
  } else if (selected.label.includes("Link Project")) {
    await handleLinkProject();
  } else if (selected.label.includes("Add Directory")) {
    await handleAddDirectory();
  } else if (selected.label.includes("Open Dashboard")) {
    handleOpenDashboard();
  } else if (selected.label.includes("Sign Out")) {
    await handleSignOut();
  }
}

async function handleInstallCommitGuard(): Promise<void> {
  await gitCommitGuardService.initialize();
  vscode.window.showInformationMessage(
    "Envpilot: Commit guard hook installed successfully."
  );
}

async function handleRemoveCommitGuard(): Promise<void> {
  await gitCommitGuardService.removeHooks();
  vscode.window.showInformationMessage("Envpilot: Commit guard hook removed.");
}

export async function deactivate() {
  // Clean up synced .env files to prevent secrets from persisting on disk
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const projects = storageService.getLinkedProjectsMetadataV2();
    for (const project of projects) {
      for (const dir of project.directories) {
        const envFilePath = path.resolve(dir.directoryPath, dir.targetFile);
        try {
          await fs.chmod(envFilePath, 0o644);
          await fs.unlink(envFilePath);
        } catch {
          // File may not exist or be inaccessible
        }
      }
    }
  } catch {
    // Best-effort cleanup — don't block deactivation
  }
  // Remaining cleanup handled by dispose subscriptions
  await closeSentry();
}
