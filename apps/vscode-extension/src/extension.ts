import * as vscode from "vscode";
import * as path from "path";
import { existsSync } from "fs";
import { chmod, readdir, stat, unlink } from "fs/promises";
import { AuthService } from "./services/auth";
import { ApiService } from "./services/api";
import { SyncService } from "./services/sync";
import { RealTimeSyncService } from "./services/realTimeSync";
import { ConvexService } from "./services/convex";
import { TokenManager } from "./services/tokenManager";
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
import { CloakService } from "./services/cloak";
import { GitCommitGuardService } from "./services/gitCommitGuard";
import { EnvCodeLensProvider } from "./providers/envCodeLensProvider";
import { registerAutocomplete } from "./providers/autocomplete";
import { registerEnvHover, revealHoverValue } from "./providers/envHover";
import {
  MARKETPLACE_URI,
  VersionCheckService,
  isExtensionOutdated,
} from "./services/versionCheck";
import { openUrlReliably } from "./utils/browser";
import {
  initSentry,
  captureError,
  closeSentry,
  setSentryUser,
  clearSentryUser,
} from "./utils/sentry";
import { getDeviceInfo } from "./utils/device";
import {
  getServerUrl,
  getConvexUrl,
  shouldAutoSync,
  isCommitGuardEnabled,
  shouldAutoInstallHook,
  getIdlePauseMinutes,
} from "./utils/config";
import { getDisplayPath, isPathInside } from "./utils/paths";
import { envFileNamesFor } from "./utils/envFiles";
import {
  purgeManagedFilesFiltered,
  readManifest,
  renameManagedFile,
  getManifestPath,
} from "./utils/managedFiles";
import {
  writeSessionMarker,
  clearSessionMarker,
  reapDeadSessionMarkers,
  getLiveSessionFolders,
  appendUnsyncReport,
  drainUnsyncReports,
} from "./utils/unsyncState";
import { roleLevel, ROLE_LEVEL } from "./roles";
import {
  groupProjectsForPicker,
  isRequestEligible,
} from "./utils/requestTarget";
import type { AuthSession, Project } from "./types";
import * as output from "./utils/outputChannel";

function wrapCommand<A extends unknown[]>(
  fn: (...a: A) => Promise<unknown>
): (...a: A) => Promise<void> {
  return async (...args: A) => {
    if (isExtensionOutdated()) {
      const action = await vscode.window.showErrorMessage(
        "Envpilot must be updated before you can use it. Your version no longer works with the server.",
        { modal: true },
        "Update"
      );
      if (action === "Update") {
        void vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URI));
      }
      return;
    }
    try {
      await fn(...args);
    } catch (err) {
      captureError(err);
      const message = err instanceof Error ? err.message : String(err);
      output.error(message);
      void vscode.window.showErrorMessage(`Envpilot: ${message}`);
    }
  };
}

let authService: AuthService;
let apiService: ApiService;
let tokenManager: TokenManager;
let syncService: SyncService;
let realTimeSyncService: RealTimeSyncService;
let convexService: ConvexService | null = null;
let convexReady: Promise<void> = Promise.resolve();
let storageService: StorageService;
let fileProtectionService: FileProtectionService;
let clipboardGuardService: ClipboardGuardService;
let cloakService: CloakService;
let gitCommitGuardService: GitCommitGuardService;
let envCodeLensProvider: EnvCodeLensProvider;
let projectsTreeProvider: ProjectsTreeProvider;
let variablesTreeProvider: VariablesTreeProvider;
let statusBarProvider: StatusBarProvider;
let linkProjectDialog: LinkProjectDialog;
let requestVariableDialog: RequestVariableDialog;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let syncRunning = false;
let isIdlePaused = false;
let activeSessionId: string | null = null;
let sessionChanges: Promise<void> = Promise.resolve();

function canRevealSecrets(): boolean {
  return syncService.canRevealSecrets(
    storageService.getLinkedProjectsMetadataV2().map((p) => p.projectId)
  );
}

async function updateContextFlags(): Promise<void> {
  const [authenticated, linkedProjects] = await Promise.all([
    authService.isAuthenticated(),
    syncService.getAllLinkedProjectsV2(),
  ]);
  const canSubmitRequests = linkedProjects.some(
    (p) =>
      apiService.getAccessMeta(p.projectId)?.capabilities?.[
        "project.requests.submit"
      ] === true
  );
  await Promise.all([
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.isAuthenticated",
      authenticated
    ),
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.hasLinkedProject",
      linkedProjects.length > 0
    ),
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.canSubmitRequests",
      canSubmitRequests
    ),
    vscode.commands.executeCommand(
      "setContext",
      "envpilot.canRevealSecrets",
      canRevealSecrets()
    ),
  ]);
}

async function startSyncPipeline(): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    output.log(
      "Envpilot: workspace is in Restricted Mode, sync is paused until you trust it (cleanup still runs)."
    );
    return;
  }
  if (!shouldAutoSync() || !(await authService.isAuthenticated())) return;

  syncRunning = true;
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const project of await syncService.getAllLinkedProjectsV2()) {
    const inWorkspace = project.directories.some((dir) =>
      folders.some((folder) =>
        isPathInside(dir.directoryPath, folder.uri.fsPath)
      )
    );
    if (inWorkspace) {
      void syncService.syncAllDirectories(project).catch(captureError);
    }
  }

  await convexReady;
  if (!syncRunning) return;
  syncService.startPeriodicSync();
  await realTimeSyncService.startRealTimeSync();
}

function stopSyncPipeline(): void {
  syncRunning = false;
  isIdlePaused = false;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  syncService.stopPeriodicSync();
  realTimeSyncService.stopRealTimeSync();
}

function onSessionChanged(session: AuthSession | null): void {
  sessionChanges = sessionChanges
    .then(() => applySession(session))
    .catch(captureError);
}

async function applySession(session: AuthSession | null): Promise<void> {
  const sessionId = session?.user.id ?? null;
  if (sessionId === activeSessionId) return;
  activeSessionId = sessionId;
  apiService.clearCache();
  convexService?.reauthenticate();
  if (session) {
    setSentryUser(session.user.id);
  } else {
    clearSentryUser();
  }
  projectsTreeProvider.setAuthenticated(session !== null);
  variablesTreeProvider.refresh();
  envCodeLensProvider.refresh();
  void statusBarProvider.update();
  await updateContextFlags();

  stopSyncPipeline();
  if (session) {
    await startSyncPipeline();
  }
}

async function onLinksChanged(): Promise<void> {
  if (syncRunning && !isIdlePaused) {
    await syncService.refreshSubscriptions();
    await realTimeSyncService.refreshSubscriptions();
  }
  if (isCommitGuardEnabled() && shouldAutoInstallHook()) {
    void gitCommitGuardService.installHooks().catch(captureError);
  }
  projectsTreeProvider.refresh();
  variablesTreeProvider.refresh();
  envCodeLensProvider.refresh();
  void statusBarProvider.update();
  await updateContextFlags();
}

async function initializeConvexService(): Promise<void> {
  const convexUrl = getConvexUrl();
  if (!convexUrl) {
    output.warn("No Convex URL available, WebSocket sync disabled");
    return;
  }
  try {
    convexService = new ConvexService(convexUrl, tokenManager.getFreshToken);
    syncService.setConvexService(convexService);
    realTimeSyncService.setConvexService(convexService);
    output.log("Convex WebSocket connection initialized");
  } catch (error) {
    output.error(
      `Failed to initialize Convex service: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function sweepStaleTemp(targetPath: string): Promise<void> {
  const dir = path.dirname(targetPath);
  const prefix = `${path.basename(targetPath)}.tmp-envpilot.`;

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix)) continue;
    const tmpPath = path.join(dir, entry);
    try {
      const s = await stat(tmpPath);
      if (Date.now() - s.mtimeMs > 60_000) {
        await unlink(tmpPath);
      }
    } catch {}
  }
}

export async function activate(context: vscode.ExtensionContext) {
  initSentry();

  storageService = new StorageService(context);
  tokenManager = new TokenManager(storageService);
  authService = new AuthService(storageService, tokenManager);
  apiService = new ApiService(tokenManager);
  fileProtectionService = new FileProtectionService();
  clipboardGuardService = new ClipboardGuardService();
  clipboardGuardService.activate();
  cloakService = new CloakService((fsPath) =>
    clipboardGuardService.isManaged(fsPath)
  );
  cloakService.activate();
  gitCommitGuardService = new GitCommitGuardService(() =>
    storageService
      .getLinkedProjectsMetadataV2()
      .flatMap((p) => p.directories.map((d) => d.directoryPath))
  );
  syncService = new SyncService(apiService, storageService);
  syncService.setFileProtection(fileProtectionService);
  syncService.setClipboardGuard(clipboardGuardService);
  realTimeSyncService = new RealTimeSyncService(
    syncService,
    storageService,
    tokenManager.getFreshToken
  );
  projectsTreeProvider = new ProjectsTreeProvider(apiService, storageService);
  variablesTreeProvider = new VariablesTreeProvider(apiService, storageService);
  statusBarProvider = new StatusBarProvider(
    authService,
    syncService,
    storageService
  );
  envCodeLensProvider = new EnvCodeLensProvider(storageService);
  linkProjectDialog = new LinkProjectDialog(syncService);
  requestVariableDialog = new RequestVariableDialog();

  context.subscriptions.push(
    vscode.env.onDidChangeTelemetryEnabled((enabled) => {
      if (enabled) {
        initSentry();
        void authService
          .getCurrentUser()
          .then((user) => {
            if (user) setSentryUser(user.id);
          })
          .catch(captureError);
      } else {
        void closeSentry();
      }
    }),
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
    ),
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
      wrapCommand(handleRefresh)
    ),
    vscode.commands.registerCommand(
      "envpilot.openDashboard",
      wrapCommand(handleOpenDashboard)
    ),
    vscode.commands.registerCommand(
      "envpilot.showStatus",
      wrapCommand(handleShowStatus)
    ),
    vscode.commands.registerCommand(
      "envpilot.addDirectory",
      wrapCommand(handleAddDirectory)
    ),
    vscode.commands.registerCommand(
      "envpilot.removeDirectory",
      wrapCommand(handleRemoveDirectory)
    ),
    vscode.commands.registerCommand(
      "envpilot.requestVariable",
      wrapCommand(handleRequestVariable)
    ),
    vscode.commands.registerCommand(
      "envpilot.installCommitGuard",
      wrapCommand(handleInstallCommitGuard)
    ),
    vscode.commands.registerCommand(
      "envpilot.removeCommitGuard",
      wrapCommand(handleRemoveCommitGuard)
    ),
    vscode.commands.registerCommand(
      "envpilot.toggleCloaking",
      wrapCommand(async () => {
        if (cloakService.isEnabled() && !canRevealSecrets()) {
          vscode.window.showWarningMessage(
            "Envpilot: your role does not allow unmasking secret values."
          );
          return;
        }
        await cloakService.toggle();
      })
    ),
    vscode.commands.registerCommand(
      "envpilot.revealValues",
      wrapCommand(async () => {
        if (!canRevealSecrets()) {
          vscode.window.showWarningMessage(
            "Envpilot: your role does not allow revealing secret values. Ask an organization owner if you need this."
          );
          return;
        }
        cloakService.reveal();
      })
    ),
    vscode.commands.registerCommand(
      "envpilot.revealHoverValue",
      wrapCommand(
        (args?: {
          key?: unknown;
          projectId?: unknown;
          environment?: unknown;
        }) => revealHoverValue(apiService, storageService, args)
      )
    ),
    vscode.workspace.onDidRenameFiles((e) => {
      for (const { oldUri, newUri } of e.files) {
        clipboardGuardService.handleRename(oldUri.fsPath, newUri.fsPath);
        void renameManagedFile(oldUri.fsPath, newUri.fsPath).catch(
          captureError
        );
      }
    }),
    authService.onAuthStateChanged(onSessionChanged),
    realTimeSyncService.onRevocationDetected(({ project, reason }) => {
      apiService.clearCache();
      projectsTreeProvider.refresh();
      variablesTreeProvider.refresh();
      void statusBarProvider.update();
      void updateContextFlags().catch(captureError);
      output.log(`Revocation detected for ${project.projectName}: ${reason}`);
    }),
    syncService.onSyncComplete(() => {
      envCodeLensProvider.refresh();
      cloakService.refresh();
      void updateContextFlags().catch(captureError);
      void maybeShowUnsyncNotice(context);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      variablesTreeProvider.refresh();
      void statusBarProvider.update();
    }),
    vscode.workspace.onDidGrantWorkspaceTrust(() => {
      void startSyncPipeline().catch(captureError);
    }),
    vscode.window.onDidChangeWindowState((windowState) => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }

      if (windowState.focused) {
        if (!isIdlePaused) return;
        isIdlePaused = false;
        void realTimeSyncService.resume().catch(captureError);
        syncService.resume();
        output.log("Envpilot: real-time sync resumed");
        return;
      }

      const idleMinutes = getIdlePauseMinutes();
      if (idleMinutes <= 0 || !syncRunning) return;

      idleTimer = setTimeout(
        () => {
          idleTimer = null;
          if (vscode.window.state.focused || !syncRunning) return;
          realTimeSyncService.pause();
          syncService.pause();
          isIdlePaused = true;
          output.log(
            `Envpilot: real-time sync paused after ${idleMinutes} min without focus`
          );
        },
        idleMinutes * 60 * 1000
      );
    }),
    {
      dispose: () => {
        if (idleTimer) {
          clearTimeout(idleTimer);
          idleTimer = null;
        }
        authService.dispose();
        syncService.dispose();
        realTimeSyncService.dispose();
        convexService?.dispose();
        fileProtectionService.dispose();
        clipboardGuardService.dispose();
        cloakService.dispose();
        gitCommitGuardService.dispose();
        envCodeLensProvider.dispose();
        projectsTreeProvider.dispose();
        variablesTreeProvider.dispose();
        statusBarProvider.dispose();
        output.dispose();
      },
    }
  );

  const intelliSenseDeps = {
    api: apiService,
    auth: authService,
    storage: storageService,
  };
  registerAutocomplete(context, intelliSenseDeps);
  registerEnvHover(context, intelliSenseDeps);

  try {
    await storageService.migrateIfNeeded();

    const { crashed, deadFolders } = await reapDeadSessionMarkers();
    await writeSessionMarker(
      process.pid,
      vscode.workspace.workspaceFolders?.map((folder) =>
        path.resolve(folder.uri.fsPath)
      ) ?? []
    );
    if (crashed && deadFolders.length > 0) {
      await runUnsyncPurge("crash-sweep", deadFolders);
    }

    convexReady = initializeConvexService();

    const session = await authService.getSession();
    activeSessionId = session?.user.id ?? null;
    for (const entry of await readManifest(getManifestPath())) {
      void sweepStaleTemp(entry.path).catch(captureError);
      if (session && existsSync(entry.path)) {
        clipboardGuardService.protectFile(
          entry.path,
          entry.mode ?? "readonly-with-request"
        );
      }
    }

    projectsTreeProvider.setAuthenticated(session !== null);
    await updateContextFlags();

    if (session) {
      setSentryUser(session.user.id);
      void drainUnsyncReports((reports) =>
        apiService.reportUnsync(reports)
      ).catch(captureError);
    }

    if (isCommitGuardEnabled()) {
      void gitCommitGuardService
        .initialize()
        .then(() =>
          shouldAutoInstallHook() ? gitCommitGuardService.installHooks() : 0
        )
        .then((installed) => {
          if (
            installed > 0 &&
            !context.globalState.get<boolean>("envpilot.commitGuardNotified")
          ) {
            void vscode.window.showInformationMessage(
              "Envpilot: .env commit guard is active. A pre-commit hook has been installed to protect your secrets."
            );
            void context.globalState.update(
              "envpilot.commitGuardNotified",
              true
            );
          }
        })
        .catch(captureError);
    }

    void startSyncPipeline().catch(captureError);

    const versionCheckService = new VersionCheckService(context);
    void versionCheckService.checkForUpdate().catch(captureError);
    const versionCheckTimer = setInterval(
      () => void versionCheckService.checkForUpdate().catch(captureError),
      60 * 60 * 1000
    );
    versionCheckTimer.unref?.();
    context.subscriptions.push({
      dispose: () => clearInterval(versionCheckTimer),
    });
  } catch (err) {
    captureError(err, { phase: "activate" });
  }
}

async function handleSignIn(): Promise<void> {
  if (!(await authService.signIn())) return;
  const [user, accounts] = await Promise.all([
    authService.getCurrentUser(),
    authService.listAccounts(),
  ]);
  if (user && accounts.length > 1) {
    vscode.window.showInformationMessage(
      `Signed in as ${user.email}. You have ${accounts.length} accounts, use "Envpilot: Switch Account" to switch.`
    );
  }
}

async function releaseAllProtection(): Promise<void> {
  for (const entry of await readManifest(getManifestPath())) {
    fileProtectionService.unwatchFile(entry.path);
    await chmod(entry.path, 0o600).catch(() => {});
    clipboardGuardService.unprotectFile(entry.path);
  }
  cloakService.refresh();
}

async function handleSignOut(): Promise<void> {
  await authService.signOut();
  const remaining = await authService.getCurrentUser();
  if (remaining) {
    vscode.window.showInformationMessage(
      `Envpilot: Now signed in as ${remaining.email}.`
    );
  } else {
    await releaseAllProtection();
  }
}

async function handleSwitchAccount(): Promise<void> {
  const accounts = await authService.listAccounts();

  if (accounts.length === 0) {
    await handleSignIn();
    return;
  }

  const activeAccountId = await authService.getActiveAccountId();

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
      label: "$(add) Add Account",
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

  if (!picked.accountId || picked.accountId === activeAccountId) {
    return;
  }

  if (!(await authService.switchAccount(picked.accountId))) {
    vscode.window.showErrorMessage("Envpilot: Failed to switch account.");
    return;
  }
  const active = await authService.getCurrentUser();
  vscode.window.showInformationMessage(
    `Switched to ${active?.email ?? "account"}.`
  );
}

async function handleSignOutAll(): Promise<void> {
  const accounts = await authService.listAccounts();

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

  await authService.signOutAll();
  await releaseAllProtection();
  vscode.window.showInformationMessage("Signed out of all Envpilot accounts.");
}

async function handleLinkProject(item?: ProjectTreeItem): Promise<void> {
  if (!(await authService.isAuthenticated())) {
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
    const itemProject = item.project;
    projectId = itemProject._id;
    projectName = itemProject.name;
    organizationId = item.organization?._id || itemProject.organizationId || "";
    organizationName = item.organizationName || "Unknown";
    project = itemProject;
    organization = item.organization;

    if (!organization && itemProject.organizationId) {
      const orgs = await apiService.getOrganizations();
      organization = orgs.find((org) => org._id === itemProject.organizationId);
      if (organization) {
        organizationName = organization.name;
      }
    }
  } else {
    const organizations = await apiService.getOrganizations();

    if (organizations.length === 0) {
      vscode.window.showWarningMessage("No organizations found");
      return;
    }

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

    const accessCheck = await apiService.checkExtensionAccess(
      orgPick.organization._id
    );
    if (!accessCheck.enabled) {
      vscode.window.showWarningMessage(
        accessCheck.reason || "Extension access requires Pro tier"
      );
      return;
    }

    const projects = await apiService.getProjects(orgPick.organization._id);

    if (projects.length === 0) {
      vscode.window.showWarningMessage(
        "No projects found in this organization"
      );
      return;
    }

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

  const existingProject = await storageService.getLinkedProjectV2(projectId);

  if (existingProject) {
    const choice = await vscode.window.showInformationMessage(
      `"${projectName}" is already linked. Add another directory?`,
      "Add Directory",
      "Cancel"
    );

    if (choice === "Add Directory") {
      const linkOptions =
        await linkProjectDialog.showAddDirectoryDialog(projectName);
      if (!linkOptions) return;

      await syncService.addDirectoryToProject(existingProject, linkOptions);
      vscode.window.showInformationMessage(
        `Added ${getDisplayPath(linkOptions.directoryPath)} to ${projectName}`
      );
      await onLinksChanged();
    }
    return;
  }

  const allLinkedProjects = await syncService.getAllLinkedProjectsV2();
  if (allLinkedProjects.length > 0) {
    await apiService.getProjects();

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

  if (!project || !organization) {
    vscode.window.showErrorMessage("Project or organization not found");
    return;
  }

  const linkOptions = await linkProjectDialog.showLinkDialog(
    {
      _id: projectId,
      name: projectName,
      slug: projectName.toLowerCase().replace(/\s+/g, "-"),
      description: project.description || null,
      organizationId: organization._id,
      icon: null,
      color: null,
    },
    {
      _id: organization._id,
      name: organizationName,
      slug: organizationName.toLowerCase().replace(/\s+/g, "-"),
      tier: organization.tier,
    }
  );
  if (!linkOptions) return;

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
  await onLinksChanged();
}

async function handleAddDirectory(item?: ProjectTreeItem): Promise<void> {
  if (!(await authService.isAuthenticated())) {
    vscode.window.showWarningMessage("Please sign in first");
    return;
  }

  let projectId: string;
  let projectName: string;

  if (item?.project) {
    projectId = item.project._id;
    projectName = item.project.name;
  } else {
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

  const project = await storageService.getLinkedProjectV2(projectId);
  if (!project) {
    vscode.window.showWarningMessage("Project not found");
    return;
  }

  const linkOptions =
    await linkProjectDialog.showAddDirectoryDialog(projectName);
  if (!linkOptions) return;

  await syncService.addDirectoryToProject(project, linkOptions);
  vscode.window.showInformationMessage(
    `Added ${getDisplayPath(linkOptions.directoryPath)} to ${projectName}`
  );
  await onLinksChanged();
}

async function handleRemoveDirectory(
  item?: ProjectTreeItem | { projectId?: string; directoryPath?: string }
): Promise<void> {
  let projectId: string | undefined;
  let projectName: string | undefined;
  let directoryPath: string | undefined;

  if (item instanceof ProjectTreeItem) {
    projectId = item.project?._id;
    projectName = item.project?.name;
    directoryPath = item.directory?.directoryPath;
  } else if (item?.projectId && item.directoryPath) {
    projectId = item.projectId;
    directoryPath = item.directoryPath;
    const linked = await storageService.getLinkedProjectsV2();
    projectName = linked.find((p) => p.projectId === projectId)?.projectName;
  }

  if (!projectId || !directoryPath) {
    const linked = await storageService.getLinkedProjectsV2();
    const picks = linked.flatMap((p) =>
      p.directories.map((d) => ({
        label: getDisplayPath(d.directoryPath),
        description: p.projectName,
        projectId: p.projectId,
        projectName: p.projectName,
        directoryPath: d.directoryPath,
      }))
    );
    if (picks.length === 0) {
      vscode.window.showWarningMessage("No linked directories to remove");
      return;
    }
    const pick = await vscode.window.showQuickPick(picks, {
      placeHolder: "Select a directory to remove",
    });
    if (!pick) return;
    projectId = pick.projectId;
    projectName = pick.projectName;
    directoryPath = pick.directoryPath;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Remove "${getDisplayPath(directoryPath)}" from ${projectName ?? "this project"}?`,
    "Remove",
    "Cancel"
  );

  if (confirm !== "Remove") {
    return;
  }

  await syncService.removeDirectoryFromProject(projectId, directoryPath);
  vscode.window.showInformationMessage("Directory removed");
  await onLinksChanged();
}

async function handleRequestVariable(): Promise<void> {
  if (!(await authService.isAuthenticated())) {
    vscode.window.showWarningMessage("Please sign in first");
    return;
  }

  const [projects, orgs, currentUser, currentLinked] = await Promise.all([
    apiService.getProjects(),
    apiService.getOrganizations(),
    authService.getCurrentUser(),
    syncService.getLinkedProjectV2ForWorkspace(),
  ]);

  const rows = groupProjectsForPicker(projects, orgs, currentLinked?.projectId);
  if (!rows.some((r) => r.kind === "project")) {
    vscode.window.showInformationMessage(
      "You have direct write access in your projects. Create variables from the dashboard."
    );
    return;
  }

  type ProjectQuickPickItem = vscode.QuickPickItem & { project?: Project };
  const items: ProjectQuickPickItem[] = rows.map((row) =>
    row.kind === "separator"
      ? { label: row.label, kind: vscode.QuickPickItemKind.Separator }
      : {
          label: row.label,
          description: row.description,
          project: row.project,
        }
  );

  const email = currentUser?.email ?? "unknown";
  const pick = await vscode.window.showQuickPick(items, {
    title: `Request Variable: choose project (signed in as ${email})`,
    placeHolder: "Select the project this variable request targets",
  });
  if (!pick?.project) {
    return;
  }
  const project = pick.project;

  if (!isRequestEligible(project)) {
    vscode.window.showInformationMessage(
      "As an owner, project manager, or team lead you can create variables directly on the dashboard."
    );
    return;
  }

  const scope = project.environmentScope;
  if (scope && scope.length === 0) {
    vscode.window.showWarningMessage(
      "You don't have access to any environments in this project."
    );
    return;
  }

  const input = await requestVariableDialog.showRequestDialog(
    project,
    scope && scope.length > 0 ? scope : undefined
  );
  if (!input) {
    return;
  }

  const orgName =
    orgs.find((o) => o._id === project.organizationId)?.name ??
    project.organizationId;
  const confirm = await vscode.window.showInformationMessage(
    "Submit this variable request?",
    {
      modal: true,
      detail: [
        `Key: ${input.key}`,
        `Project: ${project.name} (${orgName})`,
        `Environments: ${input.environments.join(", ")}`,
        `Sensitive: ${input.isSensitive ? "Yes" : "No"}`,
      ].join("\n"),
    },
    "Submit Request"
  );
  if (confirm !== "Submit Request") {
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Envpilot: Submitting variable request...",
    },
    () => apiService.submitVariableRequest(input)
  );
  vscode.window.showInformationMessage(
    `Variable request "${input.key}" submitted for ${project.name} (${orgName}), pending review.`
  );
  variablesTreeProvider.refresh();
}

async function handleUnlinkProject(item?: ProjectTreeItem): Promise<void> {
  const allLinkedV2 = await syncService.getAllLinkedProjectsV2();

  if (allLinkedV2.length > 0) {
    const itemProjectId = item?.project?._id;
    let targetProject = itemProjectId
      ? allLinkedV2.find((p) => p.projectId === itemProjectId)
      : undefined;

    if (itemProjectId && !targetProject) {
      vscode.window.showWarningMessage(
        "Envpilot: this project is no longer linked."
      );
      await onLinksChanged();
      return;
    }

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
    }
    targetProject ??= allLinkedV2[0];

    const confirm = await vscode.window.showWarningMessage(
      `Unlink "${targetProject.projectName}"? This will remove all synced .env files (${targetProject.directories.length} director${targetProject.directories.length === 1 ? "y" : "ies"}).`,
      "Unlink",
      "Cancel"
    );

    if (confirm !== "Unlink") {
      return;
    }

    const deviceInfo = await getDeviceInfo(storageService.getContext());
    await apiService.unlinkExtension(
      targetProject.projectId,
      deviceInfo.deviceId
    );
    await syncService.cleanupAllDirectories(targetProject);

    vscode.window.showInformationMessage("Project unlinked");
    await onLinksChanged();
    return;
  }

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

  const deviceInfo = await getDeviceInfo(storageService.getContext());
  await apiService.unlinkExtension(projectId, deviceInfo.deviceId);
  await syncService.unlinkProject(projectId);

  vscode.window.showInformationMessage("Project unlinked");
  await onLinksChanged();
}

async function handlePullVariables(): Promise<void> {
  if (!(await authService.isAuthenticated())) {
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
      try {
        const allLinkedProjects = await syncService.getAllLinkedProjectsV2();
        if (allLinkedProjects.length === 0) {
          if (await syncService.syncCurrentWorkspace()) {
            variablesTreeProvider.refresh();
          }
          return;
        }

        const results = (
          await Promise.all(
            allLinkedProjects.map((project) =>
              syncService.syncAllDirectories(project)
            )
          )
        ).flat();
        if (results.length === 0) return;

        const successful = results.filter((r) => r.success).length;
        const projectLabel =
          allLinkedProjects.length > 1
            ? ` across ${allLinkedProjects.length} projects`
            : "";
        if (successful === results.length) {
          vscode.window.showInformationMessage(
            `Synced ${successful} director${successful === 1 ? "y" : "ies"}${projectLabel}`
          );
        } else {
          vscode.window.showWarningMessage(
            `Synced ${successful}/${results.length} directories${projectLabel}. Some failed.`
          );
        }
        variablesTreeProvider.refresh();
      } finally {
        statusBarProvider.setSyncing(false);
      }
    }
  );
}

async function handleRefresh(): Promise<void> {
  apiService.clearCache();
  await onLinksChanged();
}

async function handleOpenDashboard(): Promise<void> {
  if (!(await openUrlReliably(getServerUrl()))) {
    vscode.window.showInformationMessage(
      "Dashboard URL copied to clipboard. Paste it in your browser."
    );
  }
}

async function handleShowStatus(): Promise<void> {
  if (!(await authService.isAuthenticated())) {
    const action = await vscode.window.showInformationMessage(
      "Envpilot: Not signed in",
      "Sign In"
    );
    if (action === "Sign In") {
      await handleSignIn();
    }
    return;
  }

  const [user, accounts, allLinkedProjects] = await Promise.all([
    authService.getCurrentUser(),
    authService.listAccounts(),
    syncService.getAllLinkedProjectsV2(),
  ]);

  type StatusItem = vscode.QuickPickItem & { action?: () => Promise<void> };
  const items: StatusItem[] = [
    {
      label: "$(account) Signed in as",
      description:
        (user?.email || "Unknown") +
        (accounts.length > 1 ? `, ${accounts.length} accounts` : ""),
      alwaysShow: true,
    },
  ];

  if (accounts.length > 1) {
    items.push({
      label: "$(arrow-swap) Switch Account",
      description: "Switch to another signed-in account",
      action: handleSwitchAccount,
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
        }
      );
    }
  }

  const linked = allLinkedProjects.length > 0;
  items.push(
    { kind: vscode.QuickPickItemKind.Separator, label: "Actions" },
    {
      label: "$(sync) Pull Variables",
      description: "Sync variables now",
      action: handlePullVariables,
    },
    linked
      ? {
          label: "$(add) Add Directory",
          description: "Add another directory",
          action: () => handleAddDirectory(),
        }
      : {
          label: "$(link) Link Project",
          description: "Connect to a project",
          action: () => handleLinkProject(),
        }
  );
  if (linked) {
    items.push({
      label: "$(link-external) Unlink Project",
      description: "Disconnect from project",
      action: () => handleUnlinkProject(),
    });
  }
  items.push(
    {
      label: "$(globe) Open Dashboard",
      description: "Open Envpilot in browser",
      action: handleOpenDashboard,
    },
    {
      label: "$(sign-out) Sign Out",
      description: "Sign out of Envpilot",
      action: handleSignOut,
    }
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: "Envpilot Status",
    placeHolder: "Select an action",
  });
  await selected?.action?.();
}

async function handleInstallCommitGuard(): Promise<void> {
  await gitCommitGuardService.initialize();
  const installed = await gitCommitGuardService.installHooks();
  vscode.window.showInformationMessage(
    installed > 0
      ? `Envpilot: commit guard hook installed in ${installed} ${installed === 1 ? "repository" : "repositories"}.`
      : "Envpilot: no repository with a linked directory needs a commit guard hook."
  );
}

async function handleRemoveCommitGuard(): Promise<void> {
  const removed = await gitCommitGuardService.removeHooks();
  vscode.window.showInformationMessage(
    removed > 0
      ? `Envpilot: commit guard hook removed from ${removed} ${removed === 1 ? "repository" : "repositories"}.`
      : "Envpilot: no commit guard hook found."
  );
}

async function runUnsyncPurge(
  trigger: "close" | "crash-sweep",
  scopeFolders?: string[]
): Promise<void> {
  try {
    const folders = (
      scopeFolders ??
      vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ??
      []
    ).map((folder) => path.resolve(folder));
    if (folders.length === 0) return;

    const isInside = (child: string, parent: string) =>
      child === parent || child.startsWith(parent + path.sep);

    const projects = storageService.getLinkedProjectsMetadataV2();

    const excludedDirs = projects
      .filter((project) => project.autoUnsyncOnClose === false)
      .flatMap((project) =>
        project.directories.map((dir) => path.resolve(dir.directoryPath))
      );
    excludedDirs.push(
      ...(await getLiveSessionFolders(process.pid)).map((folder) =>
        path.resolve(folder)
      )
    );

    for (const project of projects) {
      if (project.autoUnsyncOnClose === false) continue;

      const eligibleDirs = project.directories
        .map((dir) => path.resolve(dir.directoryPath))
        .filter((dir) => folders.some((folder) => isInside(dir, folder)));
      if (eligibleDirs.length === 0) continue;

      const result = await purgeManagedFilesFiltered(
        (filePath) =>
          eligibleDirs.some((dir) => isInside(filePath, dir)) &&
          !excludedDirs.some((dir) => isInside(filePath, dir))
      );

      if (result.deleted > 0 || result.spared > 0 || result.failed > 0) {
        output.log(
          `Envpilot: unsync (${trigger}) ${project.projectName}: removed ${result.deleted}, spared ${result.spared} locally modified${result.failed > 0 ? `, ${result.failed} failed` : ""}`
        );
        if (result.failed > 0) {
          captureError(new Error("unsync purge had failures"), {
            phase: "unsync-purge",
            trigger,
            failed: result.failed,
          });
        }
        await appendUnsyncReport({
          projectId: project.projectId,
          deletedCount: result.deleted,
          sparedCount: result.spared,
          trigger,
          occurredAt: Date.now(),
        });
      }
    }
  } catch (err) {
    captureError(err, { phase: "unsync-purge", trigger });
  }
}

const UNSYNC_NOTICE_KEY = "envpilot.unsyncNoticeShown";

async function maybeShowUnsyncNotice(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    if (context.globalState.get<boolean>(UNSYNC_NOTICE_KEY)) return;
    const armed = storageService
      .getLinkedProjectsMetadataV2()
      .some((project) => project.autoUnsyncOnClose !== false);
    if (!armed) return;
    await context.globalState.update(UNSYNC_NOTICE_KEY, true);
    vscode.window.showInformationMessage(
      "Envpilot: Unsync on close is active. Synced .env files are removed when VS Code closes and restored on the next sync. Hand-edited files are never touched. Configure this per project in Project Settings on the web."
    );
  } catch {}
}

export async function deactivate() {
  try {
    fileProtectionService?.dispose();
    realTimeSyncService?.dispose();
    syncService?.dispose();
  } catch {}
  await runUnsyncPurge("close");
  await clearSessionMarker(process.pid);
  await closeSentry();
}
