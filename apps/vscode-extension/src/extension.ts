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
import { VersionCheckService } from "./services/versionCheck";
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
import { envFileNamesFor } from "./utils/envFiles";
import { roleLevel, ROLE_LEVEL, normalizeOrgRole } from "./roles";
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
  const linkedProjects = await syncService.getAllLinkedProjectsV2();
  const hasLinked = linkedProjects.length > 0;
  vscode.commands.executeCommand(
    "setContext",
    "envpilot.hasLinkedProject",
    hasLinked
  );
  if (hasLinked) {
    // Use first project's role for context flags
    const firstProject = linkedProjects[0];
    const role = apiService.getUserRole(firstProject.projectId);
    const projectRole = apiService.getProjectRole(firstProject.projectId);
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
    // Normalized flag for menu when-clauses: works whether the server sends
    // legacy ("member") or unified ("developer") role names.
    const meta = apiService.getAccessMeta(firstProject.projectId);
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.isDeveloper",
      normalizeOrgRole(meta?.unifiedRole ?? role) === "developer"
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

  // Initialize Convex WebSocket connection in the background — the
  // auto-detect path makes an HTTP call (up to 5s) that must not block
  // activation. Subscriptions are wired up once it resolves.
  const convexReady = initializeConvexService();

  // Initialize commit guard in the background if enabled — it activates the
  // Git extension and spawns git processes, which is too slow for activation.
  if (isCommitGuardEnabled()) {
    void gitCommitGuardService
      .initialize()
      .then(() => {
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
      })
      .catch((err) => {
        captureError(err);
        output.error(
          `Commit guard initialization failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  }

  // Initialize UI providers
  projectsTreeProvider = new ProjectsTreeProvider(apiService, storageService);
  variablesTreeProvider = new VariablesTreeProvider(apiService, storageService);
  statusBarProvider = new StatusBarProvider(
    authService,
    syncService,
    storageService
  );
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
      "envpilot.switchAccount",
      wrapCommand(handleSwitchAccount)
    ),
    vscode.commands.registerCommand(
      "envpilot.signOutAll",
      wrapCommand(handleSignOutAll)
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
    const linkedProject = await syncService.getLinkedProjectV2ForWorkspace();
    if (linkedProject) {
      void syncService.syncAllDirectories(linkedProject);
    }

    await updateContextFlags();

    // WebSocket subscriptions need the Convex connection — start them as
    // soon as it's ready instead of holding up activation.
    void convexReady.then(() => {
      syncService.startPeriodicSync();
      realTimeSyncService.startRealTimeSync();
    });
  }

  // Check for extension updates (non-blocking)
  const versionCheckService = new VersionCheckService(context);
  versionCheckService.checkForUpdate();

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
    // If sign-in added a new account alongside existing ones, point the user
    // at the switcher — AuthService.signIn() already showed the plain
    // "Signed in as <email>" toast for the single-account case.
    const user = await authService.getCurrentUser();
    const accounts = await storageService.listAccounts();
    if (user && accounts.length > 1) {
      vscode.window.showInformationMessage(
        `Signed in as ${user.email}. You have ${accounts.length} accounts — use "Envpilot: Switch Account" to switch.`
      );
    }

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
  apiService.clearCache();
  syncService.stopPeriodicSync();
  realTimeSyncService.stopRealTimeSync();
  projectsTreeProvider.refresh();
  variablesTreeProvider.refresh();

  // authService.signOut() only ever removes the active account, so another
  // account may now be active. Restore the "signed in" UI state for it
  // instead of leaving things in the signed-out state the auth-state-changed
  // handler just applied.
  const remainingSession = await storageService.getAuthSession();
  if (remainingSession) {
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.isAuthenticated",
      true
    );
    projectsTreeProvider.setAuthenticated(true);
    statusBarProvider.update();
    dashboardPanelProvider.refresh();
    await updateContextFlags();

    if (shouldAutoSync()) {
      await syncService.refreshSubscriptions();
      await realTimeSyncService.refreshSubscriptions();
      syncService.startPeriodicSync();
      realTimeSyncService.startRealTimeSync();
    }

    vscode.window.showInformationMessage(
      `Envpilot: Now signed in as ${remainingSession.user.email}.`
    );
  } else {
    vscode.window.showInformationMessage("Signed out.");
  }
}

/**
 * Switch the active account among all accounts signed in to this machine.
 * Mirrors the post-auth refresh handleSignIn performs (tree/status bar/
 * dashboard refresh + subscription restart) since switching accounts changes
 * which organization/project data and access tokens are in scope, just like
 * a fresh sign-in does.
 */
async function handleSwitchAccount(): Promise<void> {
  const accounts = await storageService.listAccounts();

  // Nothing to switch between yet — go straight to sign-in.
  if (accounts.length === 0) {
    await handleSignIn();
    return;
  }

  const activeAccountId = await storageService.getActiveAccountId();

  const ADD_ACCOUNT = "$(add) Add Account";
  type AccountPick = vscode.QuickPickItem & {
    accountId?: string;
    isAdd?: boolean;
  };

  const items: AccountPick[] = accounts.map((account) => ({
    label:
      account.user.id === activeAccountId
        ? `$(check) ${account.user.email}`
        : `$(account) ${account.user.email}`,
    description:
      account.user.id === activeAccountId
        ? `${account.user.name || ""} (current)`.trim()
        : account.user.name || "",
    accountId: account.user.id,
  }));

  items.push(
    { label: "", kind: vscode.QuickPickItemKind.Separator },
    {
      label: ADD_ACCOUNT,
      description: "Sign in to another account",
      isAdd: true,
    }
  );

  const picked = await vscode.window.showQuickPick(items, {
    title: "Envpilot Accounts",
    placeHolder:
      accounts.length > 1
        ? "Switch account or add a new one"
        : "Add another account",
  });

  if (!picked) {
    return;
  }

  if (picked.isAdd) {
    await handleSignIn();
    return;
  }

  // Selecting the account already active is a no-op.
  if (!picked.accountId || picked.accountId === activeAccountId) {
    return;
  }

  await switchToAccount(picked.accountId);
}

/**
 * Make `accountId` the active account and refresh every surface (tree, status
 * bar, dashboard, subscriptions). Shared by the account picker and any other
 * caller that needs to switch the active session.
 */
async function switchToAccount(accountId: string): Promise<void> {
  const switched = await storageService.setActiveAccount(accountId);
  if (!switched) {
    vscode.window.showErrorMessage("Envpilot: Failed to switch account.");
    return;
  }

  apiService.clearCache();

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Envpilot: Switching account...",
    },
    async (progress) => {
      progress.report({ message: "Loading projects and variables..." });
      projectsTreeProvider.refresh();
      variablesTreeProvider.refresh();
      statusBarProvider.update();
      dashboardPanelProvider.refresh();
      await updateContextFlags();

      if (shouldAutoSync()) {
        progress.report({ message: "Starting sync..." });
        await syncService.refreshSubscriptions();
        await realTimeSyncService.refreshSubscriptions();
        syncService.startPeriodicSync();
        realTimeSyncService.startRealTimeSync();
      }
    }
  );

  const active = await authService.getCurrentUser();
  vscode.window.showInformationMessage(
    `Switched to ${active?.email ?? "account"}.`
  );
}

/** Sign out of every account stored on this machine. */
async function handleSignOutAll(): Promise<void> {
  const accounts = await storageService.listAccounts();

  if (accounts.length === 0) {
    vscode.window.showInformationMessage("Envpilot: Not signed in.");
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    accounts.length > 1
      ? `Sign out of all ${accounts.length} Envpilot accounts on this machine?`
      : "Sign out of Envpilot?",
    { modal: true },
    "Sign Out of All"
  );

  if (confirm !== "Sign Out of All") {
    return;
  }

  await storageService.clearAllAccounts();

  // Mirror handleSignOut's teardown plus the context/UI refresh that
  // AuthService.onAuthStateChanged normally drives, since clearAllAccounts()
  // bypasses authService.signOut() (which only removes the active account
  // and shows a single-account message).
  apiService.clearCache();
  syncService.stopPeriodicSync();
  realTimeSyncService.stopRealTimeSync();
  vscode.commands.executeCommand(
    "setContext",
    "envpilot.isAuthenticated",
    false
  );
  projectsTreeProvider.setAuthenticated(false);
  variablesTreeProvider.refresh();
  statusBarProvider.update();
  dashboardPanelProvider.refresh();
  await updateContextFlags();

  vscode.window.showInformationMessage("Signed out of all Envpilot accounts.");
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

  // Check if this specific project is already linked
  const existingProject = await storageService.getLinkedProjectV2(projectId);

  if (existingProject) {
    // Same project — offer to add another directory
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

        // Refresh WebSocket subscriptions so the new directory is reactive.
        await syncService.refreshSubscriptions();
        await realTimeSyncService.refreshSubscriptions();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        vscode.window.showErrorMessage(`Failed to add directory: ${message}`);
      }
    }
    return;
  }

  // Check if other projects are already linked — enforce role-based limit
  const allLinkedProjects = await syncService.getAllLinkedProjectsV2();
  if (allLinkedProjects.length > 0) {
    // Warm the role cache before gating — getUserRole() reads a lazily
    // populated map, so a cold cache would false-negative for legit
    // admins/team-leads. getProjects() populates roles as a side effect.
    await apiService.getProjects();

    // Check whether the user is team-lead-or-above in ANY linked project.
    // roleLevel/normalizeOrgRole handle legacy role strings transparently.
    const canLinkMultiple = allLinkedProjects.some(
      (p) =>
        roleLevel(apiService.getUserRole(p.projectId)) >= ROLE_LEVEL.team_lead
    );

    if (!canLinkMultiple) {
      vscode.window.showWarningMessage(
        "Only owners, project managers, and team leads can link multiple projects. Unlink your current project first."
      );
      return;
    }
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

    // Refresh WebSocket subscriptions so the new directory is reactive.
    await syncService.refreshSubscriptions();
    await realTimeSyncService.refreshSubscriptions();
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

  // Get linked projects
  const linkedProjects = await syncService.getAllLinkedProjectsV2();
  if (linkedProjects.length === 0) {
    vscode.window.showWarningMessage(
      'No project linked. Use "Envpilot: Link Project" first.'
    );
    return;
  }

  // Pick project if multiple are linked
  let linkedProject = linkedProjects[0];
  if (linkedProjects.length > 1) {
    const pick = await vscode.window.showQuickPick(
      linkedProjects.map((p) => ({
        label: p.projectName,
        description: p.organizationName,
        project: p,
      })),
      { placeHolder: "Select a project to request a variable for" }
    );
    if (!pick) return;
    linkedProject = pick.project;
  }

  // Check role — only developers request; everyone else creates directly.
  // Prefer the authoritative unified meta from the last variables response;
  // normalizeOrgRole maps legacy "member" → "developer" transparently.
  const meta = apiService.getAccessMeta(linkedProject.projectId);
  const role = normalizeOrgRole(
    meta?.unifiedRole ?? apiService.getUserRole(linkedProject.projectId)
  );
  if (role !== "developer") {
    vscode.window.showInformationMessage(
      "As an owner, project manager, or team lead you can create variables directly on the dashboard."
    );
    return;
  }

  // A scoped developer may only request environments inside their scope —
  // the server enforces this too; filtering here just prevents a doomed pick.
  const environmentScope =
    meta?.environmentScope && meta.environmentScope.length > 0
      ? meta.environmentScope
      : undefined;

  // Show the request dialog
  const input = await requestVariableDialog.showRequestDialog(
    linkedProject.projectId,
    environmentScope
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
  const allLinkedV2 = await syncService.getAllLinkedProjectsV2();

  if (allLinkedV2.length > 0) {
    let targetProject = item?.project?._id
      ? allLinkedV2.find((p) => p.projectId === item.project!._id) || null
      : null;

    // If no tree item context and multiple projects, show picker
    if (!targetProject && allLinkedV2.length > 1) {
      const pick = await vscode.window.showQuickPick(
        allLinkedV2.map((p) => ({
          label: p.projectName,
          description: `${p.organizationName} · ${p.directories.length} director${p.directories.length === 1 ? "y" : "ies"}`,
          project: p,
        })),
        { placeHolder: "Select a project to unlink" }
      );
      if (!pick) return;
      targetProject = pick.project;
    } else if (!targetProject) {
      targetProject = allLinkedV2[0];
    }

    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${targetProject.projectName}"? This will remove all synced .env files (${targetProject.directories.length} director${targetProject.directories.length === 1 ? "y" : "ies"}).`,
      "Unlink",
      "Cancel"
    );

    if (confirm !== "Unlink") {
      return;
    }

    try {
      const deviceInfo = await getDeviceInfo(storageService.getContext());
      await apiService.unlinkExtension(
        targetProject.projectId,
        deviceInfo.deviceId
      );

      // Clean up all directories
      await syncService.cleanupAllDirectories(targetProject);
      await storageService.removeLinkedProjectV2(targetProject.projectId);

      // Tear down the unlinked project's WebSocket subscriptions so no stale
      // subscription lingers on the now-revoked access token.
      await syncService.refreshSubscriptions();
      await realTimeSyncService.refreshSubscriptions();

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

      // Sync all linked projects (V2) in parallel
      const allLinkedProjects = await syncService.getAllLinkedProjectsV2();
      if (allLinkedProjects.length > 0) {
        const resultsPerProject = await Promise.all(
          allLinkedProjects.map((project) =>
            syncService.syncAllDirectories(project)
          )
        );

        let totalSuccessful = 0;
        let totalDirs = 0;
        for (const results of resultsPerProject) {
          totalSuccessful += results.filter((r) => r.success).length;
          totalDirs += results.length;
        }

        statusBarProvider.setSyncing(false);

        if (totalDirs > 0) {
          const projectCount = allLinkedProjects.length;
          const projectLabel =
            projectCount > 1 ? ` across ${projectCount} projects` : "";
          if (totalSuccessful === totalDirs) {
            vscode.window.showInformationMessage(
              `Synced ${totalSuccessful} director${totalSuccessful === 1 ? "y" : "ies"}${projectLabel}`
            );
          } else {
            vscode.window.showWarningMessage(
              `Synced ${totalSuccessful}/${totalDirs} directories${projectLabel}. Some failed.`
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
  // Manual refresh should always hit the server, not the response cache
  apiService.clearCache();
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
  const accounts = await storageService.listAccounts();

  // Get all linked projects (V2)
  const allLinkedProjects = await syncService.getAllLinkedProjectsV2();

  const items: vscode.QuickPickItem[] = [
    {
      label: "$(account) Signed in as",
      description:
        (user?.email || "Unknown") +
        (accounts.length > 1 ? ` — ${accounts.length} accounts` : ""),
      alwaysShow: true,
    },
  ];

  if (accounts.length > 1) {
    items.push({
      label: "$(arrow-swap) Switch Account",
      description: "Switch to another signed-in account",
    });
  }

  if (allLinkedProjects.length > 0) {
    for (const linkedProjectV2 of allLinkedProjects) {
      items.push(
        {
          kind: vscode.QuickPickItemKind.Separator,
          label: `Linked: ${linkedProjectV2.projectName}`,
        },
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
        const files = Array.from(envFileNamesFor(dir).values()).join(", ");
        items.push({
          label: `  $(folder-opened) ${dir.displayName || getDisplayPath(dir.directoryPath)}`,
          description: `${dir.environments.join(", ")} -> ${files}`,
        });
      }
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
      label:
        allLinkedProjects.length > 0
          ? "$(add) Add Directory"
          : "$(link) Link Project",
      description:
        allLinkedProjects.length > 0
          ? "Add another directory"
          : "Connect to a project",
    },
    {
      label:
        allLinkedProjects.length > 0 ? "$(link-external) Unlink Project" : "",
      description:
        allLinkedProjects.length > 0 ? "Disconnect from project" : "",
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

  if (selected.label.includes("Switch Account")) {
    await handleSwitchAccount();
  } else if (selected.label.includes("Pull Variables")) {
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
  // Deactivate must only release resources — it must NEVER delete the user's
  // synced .env files. deactivate() runs on every extension-host shutdown
  // (window close, reload, VS Code/extension update), so deleting files here
  // caused guaranteed data loss (writable files hand-edited by owners/PMs/TLs
  // were destroyed with no backup). Genuine sign-out / explicit unlink delete
  // files through their own gated paths (shouldPreventCopyOnRevoke in sync.ts).
  // Remaining resource cleanup is handled by dispose subscriptions.
  await closeSentry();
}
