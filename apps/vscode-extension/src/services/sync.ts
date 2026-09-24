import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { ApiService } from "./api";
import { FileProtectionService } from "./fileProtection";
import { ClipboardGuardService } from "./clipboardGuard";
import { ConvexService } from "./convex";
import { StorageService } from "../utils/storage";
import {
  getEnvironment,
  getTargetFile,
  shouldPreventCopyOnRevoke,
} from "../utils/config";
import {
  normalizePath,
  pathKey,
  pathsEqual,
  toPlatformPath,
  isPathInside,
} from "../utils/paths";
import { materialiseSecretFiles } from "./secretFiles";
import { SingleFlight } from "../utils/singleFlight";
import { envFileNamesFor } from "../utils/envFiles";
import {
  recordManagedFile,
  forgetManagedFile,
  releaseManagedFile,
  readManifest,
  getManifestPath,
  purgeManagedFilesFiltered,
} from "../utils/managedFiles";
import {
  normalizeOrgRole,
  fileProtectionMode,
  type ProjectAccess as RoleAccess,
  type ProtectionMode,
} from "../roles";
import type {
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
  SyncResult,
  EnvironmentVariable,
  ConflictCheckResult,
  LinkDirectoryOptions,
} from "../types";

export type SyncConnectionState = "connected" | "reconnecting" | "disconnected";

const ENV_FILE_HEADER = `# Envpilot - Synced Environment Variables
# DO NOT EDIT MANUALLY - Changes will be overwritten on next sync
# Project: {projectName}
# Environment: {environment}
# Synced at: {syncedAt}
#
# To modify variables, use the Envpilot dashboard.

`;

const ENV_FILE_MARKER = "# Envpilot - Synced Environment Variables";

const ENV_FILE_MODES = { writable: 0o600, readonly: 0o400 };

function assertTrustedWorkspace(): void {
  if (!vscode.workspace.isTrusted) {
    throw new Error(
      "This workspace is in Restricted Mode. Envpilot will not write secrets here. Trust the workspace to sync."
    );
  }
}

function formatValue(value: string): string {
  if (!/[\s#"'`$\\]|[\x00-\x1f]/.test(value)) return value;
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
  return `"${escaped}"`;
}

function renderEnvFile({
  projectName,
  environment,
  variables,
}: {
  projectName: string;
  environment: string;
  variables: ReadonlyArray<
    Pick<EnvironmentVariable, "key" | "value" | "description" | "isSensitive">
  >;
}): string {
  let content = ENV_FILE_HEADER.replace("{projectName}", projectName)
    .replace("{environment}", environment)
    .replace("{syncedAt}", new Date().toISOString());
  const sections = [
    { title: "# Application Variables", sensitive: false },
    { title: "# Sensitive Variables (secrets)", sensitive: true },
  ];
  for (const { title, sensitive } of sections) {
    const section = variables.filter((v) => v.isSensitive === sensitive);
    if (section.length === 0) continue;
    content += `${title}\n`;
    for (const variable of section) {
      if (variable.description) content += `# ${variable.description}\n`;
      content += `${variable.key}=${formatValue(variable.value)}\n`;
    }
    if (!sensitive) content += "\n";
  }
  return content;
}

let tmpCounter = 0;

async function atomicWriteFile(
  filePath: string,
  content: string
): Promise<void> {
  const tmpPath = `${filePath}.tmp-envpilot.${process.pid}.${tmpCounter++}`;
  try {
    await fs.writeFile(tmpPath, content, {
      encoding: "utf-8",
      mode: ENV_FILE_MODES.writable,
    });
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.unlink(tmpPath).catch(() => {});
    throw err;
  }
}

export class SyncService {
  private api: ApiService;
  private storage: StorageService;
  private convexService: ConvexService | null = null;
  private fileProtection: FileProtectionService | null = null;
  private clipboardGuard: ClipboardGuardService | null = null;
  private metadataSubIds: string[] = [];
  private lastMetadataHash = new Map<string, string>();
  private syncDebounceTimers = new Map<string, NodeJS.Timeout>();
  private syncFlight = new SingleFlight();
  private refreshSubscriptionsQueue: Promise<void> = Promise.resolve();
  private connectionState: SyncConnectionState = "disconnected";
  private _onSyncComplete = new vscode.EventEmitter<SyncResult>();
  private _onPermissionRevoked = new vscode.EventEmitter<
    LinkedProject | LinkedProjectV2
  >();
  private _onConnectionStateChanged =
    new vscode.EventEmitter<SyncConnectionState>();

  readonly onSyncComplete = this._onSyncComplete.event;
  readonly onPermissionRevoked = this._onPermissionRevoked.event;
  readonly onConnectionStateChanged = this._onConnectionStateChanged.event;

  constructor(api: ApiService, storage: StorageService) {
    this.api = api;
    this.storage = storage;
  }

  setConvexService(convexService: ConvexService): void {
    this.convexService = convexService;
  }

  setFileProtection(fileProtection: FileProtectionService): void {
    this.fileProtection = fileProtection;
  }

  setClipboardGuard(clipboardGuard: ClipboardGuardService): void {
    this.clipboardGuard = clipboardGuard;
  }

  startPeriodicSync(): void {
    const task = this.refreshSubscriptionsQueue.then(() =>
      this.setupMetadataSubscriptions()
    );
    this.refreshSubscriptionsQueue = task.catch(() => {});
  }

  private async setupMetadataSubscriptions(): Promise<void> {
    if (!this.convexService) return;
    if (this.metadataSubIds.length > 0) return;

    const linkedProjects = await this.storage.getLinkedProjectsV2();

    for (const project of linkedProjects) {
      for (const directory of project.directories) {
        const env =
          directory.environments.length === 1
            ? directory.environments[0]
            : undefined;

        const subId = this.convexService.subscribeToVariableMetadata(
          project.projectId,
          env,
          (metadata) => {
            const hash = JSON.stringify(
              metadata.map((m) => `${m.key}:${m.version}`)
            );
            const key = this.hashKey(
              project.projectId,
              directory.directoryPath
            );
            const prevHash = this.lastMetadataHash.get(key);

            if (prevHash !== undefined && prevHash !== hash) {
              this.debouncedSync(project, directory);
            }
            this.lastMetadataHash.set(key, hash);
          }
        );

        this.metadataSubIds.push(subId);
      }
    }
  }

  private debouncedSync(
    project: LinkedProjectV2,
    directory: LinkedDirectory
  ): void {
    const key = this.hashKey(project.projectId, directory.directoryPath);
    const existing = this.syncDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(async () => {
      this.syncDebounceTimers.delete(key);
      console.log(
        `[Sync] Variable change detected for ${project.projectName}, fetching decrypted values`
      );
      await this.syncDirectory(project, directory);
    }, 2000);

    this.syncDebounceTimers.set(key, timer);
  }

  async refreshSubscriptions(): Promise<void> {
    const task = this.refreshSubscriptionsQueue.then(() =>
      this.doRefreshSubscriptions()
    );
    this.refreshSubscriptionsQueue = task.catch(() => {});
    return task;
  }

  private async doRefreshSubscriptions(): Promise<void> {
    this.teardownMetadataSubscriptions();
    await this.setupMetadataSubscriptions();
  }

  private teardownMetadataSubscriptions(): void {
    if (!this.convexService) return;
    for (const subId of this.metadataSubIds) {
      this.convexService.unsubscribe(subId);
    }
    this.metadataSubIds = [];

    for (const timer of this.syncDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.syncDebounceTimers.clear();
  }

  private hashKey(projectId: string, directoryPath: string): string {
    return `${projectId}:${pathKey(directoryPath)}`;
  }

  private pruneMetadataHashes(projectId: string, directoryPath?: string): void {
    const exact =
      directoryPath !== undefined
        ? this.hashKey(projectId, directoryPath)
        : undefined;
    for (const key of this.lastMetadataHash.keys()) {
      if (!key.startsWith(`${projectId}:`)) continue;
      if (exact === undefined || key === exact) {
        this.lastMetadataHash.delete(key);
      }
    }
  }

  stopPeriodicSync(): void {
    this.teardownMetadataSubscriptions();
  }

  pause(): void {
    if (this.metadataSubIds.length === 0) return;
    this.teardownMetadataSubscriptions();
  }

  resume(): void {
    if (this.metadataSubIds.length > 0) return;
    this.startPeriodicSync();
  }

  private async handlePermissionRevoked(
    project: LinkedProject,
    reason: string
  ): Promise<void> {
    this._onPermissionRevoked.fire(project);

    if (shouldPreventCopyOnRevoke()) {
      await this.deleteEnvFile(project);
    }

    await this.storage.removeLinkedProject(
      project.projectId,
      project.workspacePath
    );

    vscode.window.showWarningMessage(
      `Access revoked for "${project.projectName}": ${reason}. The synced .env file has been removed.`,
      "OK"
    );
  }

  async syncProject(project: LinkedProject): Promise<SyncResult> {
    try {
      if (project.expiresAt && Date.now() > project.expiresAt) {
        await this.handlePermissionRevoked(project, "Access token expired");
        return {
          success: false,
          variablesCount: 0,
          targetFile: project.targetFile,
          error: "Access token expired",
        };
      }

      const variables = await this.api.getVariables(
        project.projectId,
        project.environment
      );

      await this.writeEnvFile(project, variables);

      await this.syncSecretFiles(
        project.projectId,
        [project.environment],
        project.workspacePath
      );

      await this.storage.updateLinkedProject(
        project.projectId,
        project.workspacePath,
        {
          lastSyncedAt: Date.now(),
        }
      );

      await this.persistUnsyncFlag(project.projectId);

      const result: SyncResult = {
        success: true,
        variablesCount: variables.length,
        targetFile: project.targetFile,
      };

      this._onSyncComplete.fire(result);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const result: SyncResult = {
        success: false,
        variablesCount: 0,
        targetFile: project.targetFile,
        error: errorMessage,
      };

      this._onSyncComplete.fire(result);
      return result;
    }
  }

  async syncCurrentWorkspace(): Promise<SyncResult | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      vscode.window.showWarningMessage("No workspace folder open");
      return null;
    }

    const linkedProject =
      await this.storage.getLinkedProjectForWorkspace(workspacePath);
    if (!linkedProject) {
      vscode.window.showWarningMessage(
        'No project linked to this workspace. Use "Envpilot: Link Project" to link a project.'
      );
      return null;
    }

    return this.syncProject(linkedProject);
  }

  private async syncSecretFiles(
    projectId: string,
    environments: string[],
    root: string | undefined,
    force = false,
    forcePaths?: string[]
  ): Promise<void> {
    if (!root) return;
    assertTrustedWorkspace();

    const environment = environments[0];
    if (!environment) return;

    try {
      const result = await materialiseSecretFiles(
        this.api,
        projectId,
        environment,
        root,
        {
          force,
          forcePaths,
          setSyncing: (syncing) => this.fileProtection?.setSyncing(syncing),
          onWritten: async (file, contents) => {
            await recordManagedFile(
              file.absolutePath,
              contents,
              undefined,
              "strict-readonly",
              projectId
            );

            this.clipboardGuard?.protectFile(
              file.absolutePath,
              "strict-readonly"
            );

            this.fileProtection?.watchFile(
              file.absolutePath,
              () =>
                this.syncFlight.run(
                  `sync:${projectId}:${pathKey(root)}:${file.path}`,
                  () =>
                    this.syncSecretFiles(projectId, environments, root, true, [
                      file.path,
                    ])
                ),
              "strict-readonly",
              { writable: 0o600, readonly: file.numericMode }
            );
          },
        }
      );

      if (result.conflicts.length > 0) {
        void vscode.window.showWarningMessage(
          `Envpilot: ${result.conflicts.length} secret file(s) differ locally and were not overwritten: ${result.conflicts.join(", ")}`
        );
      }
      if (result.failed.length > 0) {
        void vscode.window.showWarningMessage(
          `Envpilot: could not write ${result.failed.length} secret file(s). ${result.failed[0]?.message ?? ""}`
        );
      }
    } catch (error) {
      console.warn(
        `[envpilot] secret file sync failed: ${
          error instanceof Error ? error.message : "unknown"
        }`
      );
    }
  }

  private async writeEnvFile(
    project: LinkedProject,
    variables: EnvironmentVariable[]
  ): Promise<void> {
    assertTrustedWorkspace();
    const envFilePath = path.resolve(project.workspacePath, project.targetFile);
    if (!isPathInside(envFilePath, project.workspacePath)) {
      throw new Error("Target file path must be within workspace");
    }
    await this.writeManagedEnvFile(
      envFilePath,
      renderEnvFile({
        projectName: project.projectName,
        environment: project.environment,
        variables,
      }),
      this.resolveProtectionMode(project.projectId, variables),
      async () => {
        await this.syncProject(project);
      }
    );
  }

  private async writeManagedEnvFile(
    filePath: string,
    content: string,
    mode: ProtectionMode,
    onDrift: () => Promise<void>
  ): Promise<void> {
    this.fileProtection?.setSyncing(true);
    try {
      await fs.chmod(filePath, ENV_FILE_MODES.writable).catch(() => {});
      await atomicWriteFile(filePath, content);
      await recordManagedFile(filePath, content, undefined, mode);
      this.clipboardGuard?.protectFile(filePath, mode);
      if (mode !== "writable") {
        await fs.chmod(filePath, ENV_FILE_MODES.readonly);
      }
      this.fileProtection?.watchFile(filePath, onDrift, mode, ENV_FILE_MODES);
    } finally {
      this.fileProtection?.setSyncing(false);
    }
  }

  private buildProjectAccess(
    projectId: string,
    variables: EnvironmentVariable[]
  ): RoleAccess {
    const meta = this.api.getAccessMeta(projectId);
    const projectRole = this.api.getProjectRole(projectId);
    const role = normalizeOrgRole(
      meta?.unifiedRole ?? this.api.getUserRole(projectId)
    );
    return {
      role,
      assigned:
        role === "owner" || (meta?.assigned ?? projectRole !== undefined),
      environmentScope: meta?.environmentScope ?? null,
      hasWriteAccess:
        meta?.hasWriteAccess ?? variables.some((v) => v.access === "write"),
    };
  }

  private resolveProtectionMode(
    projectId: string,
    variables: EnvironmentVariable[]
  ): ProtectionMode {
    return fileProtectionMode(
      this.buildProjectAccess(projectId, variables),
      this.api.getAccessMeta(projectId)?.capabilities
    );
  }

  canRevealSecrets(projectIds: string[]): boolean {
    if (projectIds.length === 0) return false;
    return projectIds.every(
      (id) =>
        this.api.getAccessMeta(id)?.capabilities?.["project.secrets.reveal"] ===
        true
    );
  }

  setConnectionState(state: SyncConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this._onConnectionStateChanged.fire(state);
  }

  getConnectionState(): SyncConnectionState {
    return this.connectionState;
  }

  private async deleteEnvFile(project: LinkedProject): Promise<void> {
    const envFilePath = path.resolve(project.workspacePath, project.targetFile);
    const normalizedWorkspace = path.resolve(project.workspacePath);

    if (
      !envFilePath.startsWith(normalizedWorkspace + path.sep) &&
      envFilePath !== normalizedWorkspace
    ) {
      return;
    }

    if (this.fileProtection) {
      this.fileProtection.unwatchFile(envFilePath);
    }
    if (this.clipboardGuard) {
      this.clipboardGuard.unprotectFile(envFilePath);
    }

    try {
      await fs.access(envFilePath);
      await fs.chmod(envFilePath, ENV_FILE_MODES.writable);
      await fs.unlink(envFilePath);
    } catch {}
    await forgetManagedFile(envFilePath);
  }

  async linkProject(
    projectId: string,
    projectName: string,
    organizationId: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number
  ): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      vscode.window.showWarningMessage("No workspace folder open");
      return null;
    }

    const linkedProject: LinkedProject = {
      projectId,
      projectName,
      organizationId,
      organizationName,
      accessToken,
      expiresAt,
      environment: getEnvironment(),
      targetFile: getTargetFile(),
      lastSyncedAt: null,
      workspacePath,
    };

    await this.storage.addLinkedProject(linkedProject);

    await this.syncProject(linkedProject);

    return linkedProject;
  }

  async unlinkProject(projectId: string): Promise<void> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return;
    }

    const linkedProject =
      await this.storage.getLinkedProjectForWorkspace(workspacePath);
    if (linkedProject && linkedProject.projectId === projectId) {
      if (shouldPreventCopyOnRevoke()) {
        await this.deleteEnvFile(linkedProject);
      }

      await this.storage.removeLinkedProject(projectId, workspacePath);
    }
  }

  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }

  async getLinkedProject(): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return null;
    }
    return this.storage.getLinkedProjectForWorkspace(workspacePath);
  }

  async checkForConflicts(
    directoryPath: string,
    targetFile: string,
    environments: string[]
  ): Promise<ConflictCheckResult> {
    const platformPath = toPlatformPath(directoryPath);
    const filenames = new Set(
      envFileNamesFor({ environments, targetFile }).values()
    );

    let existingFile: string | undefined;
    const keys = new Set<string>();

    for (const filename of filenames) {
      const envFilePath = path.resolve(platformPath, filename);
      const content = await fs.readFile(envFilePath, "utf-8").catch(() => "");
      if (!content.trim()) continue;
      existingFile ??= envFilePath;
      for (const key of this.parseEnvFile(content).keys()) keys.add(key);
    }

    if (existingFile === undefined) {
      return { hasConflict: false };
    }

    return {
      hasConflict: true,
      existingFile,
      existingVariableCount: keys.size,
      existingKeys: [...keys],
    };
  }

  async backupEnvFile(
    directoryPath: string,
    targetFile: string,
    environments: string[]
  ): Promise<string[]> {
    const platformPath = toPlatformPath(directoryPath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filenames = new Set(
      envFileNamesFor({ environments, targetFile }).values()
    );

    const backups: string[] = [];
    for (const filename of filenames) {
      const envFilePath = path.resolve(platformPath, filename);
      let existingContent: string;
      try {
        existingContent = await fs.readFile(envFilePath, "utf-8");
      } catch {
        continue;
      }
      const backupPath = `${envFilePath}.backup-${timestamp}`;
      await fs.copyFile(envFilePath, backupPath);
      if (existingContent.startsWith(ENV_FILE_MARKER)) {
        await recordManagedFile(backupPath, existingContent);
      }
      backups.push(backupPath);
    }
    return backups;
  }

  private parseEnvFile(content: string): Map<string, string> {
    const vars = new Map<string, string>();
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex);
          let value = trimmed.substring(eqIndex + 1);

          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          vars.set(key, value);
        }
      }
    }

    return vars;
  }

  async mergeEnvFiles(
    projectId: string,
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environment: string,
    newVariables: EnvironmentVariable[]
  ): Promise<void> {
    assertTrustedWorkspace();
    const envFilePath = path.resolve(toPlatformPath(directoryPath), targetFile);

    let existingVars: Map<string, string> = new Map();

    try {
      const content = await fs.readFile(envFilePath, "utf-8");
      existingVars = this.parseEnvFile(content);
    } catch {}

    for (const variable of newVariables) {
      existingVars.set(variable.key, variable.value);
    }

    await this.writeManagedEnvFile(
      envFilePath,
      renderEnvFile({
        projectName,
        environment,
        variables: [...existingVars].map(([key, value]) => ({
          key,
          value,
          description: null,
          isSensitive: false,
        })),
      }),
      this.resolveProtectionMode(projectId, newVariables),
      async () => {
        const project = await this.storage.getLinkedProjectV2(projectId);
        const dir = project?.directories.find((d) =>
          pathsEqual(d.directoryPath, directoryPath)
        );
        if (project && dir) await this.syncDirectory(project, dir);
      }
    );
  }

  private async mergeDirectory(
    projectId: string,
    projectName: string,
    directory: LinkedDirectory
  ): Promise<void> {
    const envToFile = envFileNamesFor(directory);
    const envs = Array.from(envToFile.keys());

    const varsByEnv = await Promise.all(
      envs.map((env) => this.api.getVariables(projectId, env))
    );

    await Promise.all(
      envs.map((env, i) =>
        this.mergeEnvFiles(
          projectId,
          directory.directoryPath,
          envToFile.get(env) as string,
          projectName,
          env,
          varsByEnv[i]
        )
      )
    );
  }

  async syncDirectory(
    project: LinkedProjectV2,
    directory: LinkedDirectory
  ): Promise<SyncResult> {
    return this.syncFlight.run(
      `sync:${project.projectId}:${pathKey(directory.directoryPath)}`,
      async () => {
        const result = await this.doSyncDirectory(project, directory);
        if (!result) {
          return {
            success: false,
            variablesCount: 0,
            targetFile: directory.targetFile,
            error: "Directory is no longer linked",
          };
        }
        this._onSyncComplete.fire(result);
        return result;
      }
    );
  }

  private async doSyncDirectory(
    project: LinkedProjectV2,
    directory: LinkedDirectory
  ): Promise<SyncResult | undefined> {
    const envToFile = envFileNamesFor(directory);
    const envs = Array.from(envToFile.keys());
    const derivedFiles = Array.from(envToFile.values());

    try {
      const varsByEnv = await Promise.all(
        envs.map((env) =>
          this.api.getVariables(project.projectId, env, undefined, {
            fresh: true,
          })
        )
      );

      const linked = await this.storage.getLinkedProjectV2(project.projectId);
      if (
        !linked?.directories.some((d) =>
          pathsEqual(d.directoryPath, directory.directoryPath)
        )
      ) {
        return undefined;
      }

      const writeResults = await Promise.allSettled(
        envs.map((env, i) =>
          this.writeEnvFileToDirectory(
            directory.directoryPath,
            envToFile.get(env) as string,
            project.projectName,
            env,
            varsByEnv[i],
            project.projectId
          )
        )
      );

      await this.syncSecretFiles(
        project.projectId,
        directory.environments,
        directory.directoryPath
      );

      await this.cleanupStaleMergedFile(directory, envToFile);

      const totalVars = varsByEnv.reduce((n, vars) => n + vars.length, 0);
      const failures = writeResults.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );

      if (failures.length > 0) {
        return {
          success: false,
          variablesCount: totalVars,
          targetFile: derivedFiles.join(", "),
          error: failures
            .map((f) =>
              f.reason instanceof Error ? f.reason.message : String(f.reason)
            )
            .join("; "),
        };
      }

      await this.storage.updateDirectorySyncTime(
        project.projectId,
        directory.directoryPath
      );

      await this.persistUnsyncFlag(project.projectId);

      return {
        success: true,
        variablesCount: totalVars,
        targetFile: derivedFiles.join(", "),
      };
    } catch (error) {
      return {
        success: false,
        variablesCount: 0,
        targetFile: derivedFiles.join(", "),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async cleanupStaleMergedFile(
    directory: LinkedDirectory,
    envToFile: Map<string, string>
  ): Promise<void> {
    if (directory.environments.length <= 1) return;

    const derived = new Set(envToFile.values());
    if (derived.has(directory.targetFile)) return;

    await this.unlinkDirFile(directory.directoryPath, directory.targetFile);
  }

  async syncAllDirectories(project: LinkedProjectV2): Promise<SyncResult[]> {
    return Promise.all(
      project.directories.map((directory) =>
        this.syncDirectory(project, directory)
      )
    );
  }

  private async writeEnvFileToDirectory(
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environment: string,
    variables: EnvironmentVariable[],
    projectId: string
  ): Promise<void> {
    assertTrustedWorkspace();
    const platformPath = toPlatformPath(directoryPath);
    const envFilePath = path.resolve(platformPath, targetFile);
    if (!isPathInside(envFilePath, platformPath)) {
      throw new Error("Target file path must be within directory");
    }
    await this.writeManagedEnvFile(
      envFilePath,
      renderEnvFile({ projectName, environment, variables }),
      this.resolveProtectionMode(projectId, variables),
      async () => {
        const project = await this.storage.getLinkedProjectV2(projectId);
        const dir = project?.directories.find((d) =>
          pathsEqual(d.directoryPath, directoryPath)
        );
        if (project && dir) await this.syncDirectory(project, dir);
      }
    );
  }

  async cleanupAllDirectories(project: LinkedProjectV2): Promise<number> {
    await this.storage.removeLinkedProjectV2(project.projectId);
    this.pruneMetadataHashes(project.projectId);
    await this.syncFlight.wait(`sync:${project.projectId}:`);
    const errors: Error[] = [];
    let spared = 0;

    for (const directory of project.directories) {
      try {
        await this.deleteSecretFilesFromDirectory(project.projectId, directory);
        spared += await this.deleteEnvFileFromDirectory(directory);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to cleanup ${errors.length}/${project.directories.length} directories`
      );
    }
    return spared;
  }

  private async deleteSecretFilesFromDirectory(
    projectId: string,
    directory: LinkedDirectory
  ): Promise<void> {
    const resolvedDir = path.resolve(toPlatformPath(directory.directoryPath));
    const normalizedDir = await fs
      .realpath(resolvedDir)
      .catch(() => resolvedDir);
    const envFiles = new Set(envFileNamesFor(directory).values());
    envFiles.add(directory.targetFile);

    let entries: Awaited<ReturnType<typeof readManifest>>;
    try {
      entries = await readManifest(getManifestPath());
    } catch {
      return;
    }

    for (const entry of entries) {
      const filePath = path.resolve(entry.path);
      const rel = path.relative(normalizedDir, filePath);
      if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) continue;
      if (envFiles.has(rel)) continue;
      const lastOwner = await releaseManagedFile(filePath, projectId);
      if (!lastOwner) continue;

      this.fileProtection?.unwatchFile(filePath);
      this.clipboardGuard?.unprotectFile(filePath);

      try {
        await fs.chmod(filePath, ENV_FILE_MODES.writable);
        await fs.unlink(filePath);
      } catch {}
    }
  }

  private async deleteEnvFileFromDirectory(
    directory: LinkedDirectory
  ): Promise<number> {
    const dir = path.resolve(toPlatformPath(directory.directoryPath));
    const derived = new Set(envFileNamesFor(directory).values());
    const derivedPaths = [...derived].map((file) => path.resolve(dir, file));

    for (const filePath of derivedPaths) {
      this.fileProtection?.unwatchFile(filePath);
      this.clipboardGuard?.unprotectFile(filePath);
    }
    const { spared } = await purgeManagedFilesFiltered((filePath) =>
      derivedPaths.some((derivedPath) => pathsEqual(derivedPath, filePath))
    );

    if (!derived.has(directory.targetFile)) {
      await this.unlinkDirFile(directory.directoryPath, directory.targetFile);
    }
    return spared;
  }

  private async unlinkDirFile(
    directoryPath: string,
    filename: string
  ): Promise<void> {
    const platformPath = toPlatformPath(directoryPath);
    const filePath = path.resolve(platformPath, filename);
    const normalizedDir = path.resolve(platformPath);

    if (
      !filePath.startsWith(normalizedDir + path.sep) &&
      filePath !== normalizedDir
    ) {
      return;
    }

    let content: string;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      return;
    }
    if (!content.startsWith(ENV_FILE_MARKER)) {
      console.warn(
        `[Sync] Leaving ${filePath} untouched, no Envpilot header, looks user-authored`
      );
      return;
    }

    this.fileProtection?.unwatchFile(filePath);
    this.clipboardGuard?.unprotectFile(filePath);

    try {
      await fs.access(filePath);
      await fs.chmod(filePath, ENV_FILE_MODES.writable);
      await fs.unlink(filePath);
    } catch {}
    await forgetManagedFile(filePath);
  }

  async linkProjectWithDirectory(
    projectId: string,
    projectName: string,
    organizationId: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number,
    options: LinkDirectoryOptions
  ): Promise<LinkedProjectV2 | null> {
    assertTrustedWorkspace();
    if (options.conflictStrategy === "skip") return null;
    const directory: LinkedDirectory = {
      directoryPath: normalizePath(options.directoryPath),
      targetFile: options.targetFile || getTargetFile(),
      environments: options.environments || [getEnvironment()],
      displayName: options.displayName,
      lastSyncedAt: null,
      createdAt: Date.now(),
    };

    if (options.conflictStrategy === "backup") {
      const conflict = await this.checkForConflicts(
        options.directoryPath,
        directory.targetFile,
        directory.environments
      );
      if (conflict.hasConflict) {
        await this.backupEnvFile(
          options.directoryPath,
          directory.targetFile,
          directory.environments
        );
      }
    }

    await this.storage.addLinkedProjectV2(
      projectId,
      projectName,
      organizationId,
      organizationName,
      accessToken,
      expiresAt,
      directory,
      getEnvironment()
    );

    const project = await this.storage.getLinkedProjectV2(projectId);
    if (!project) {
      return null;
    }

    if (options.conflictStrategy === "merge") {
      await this.mergeDirectory(projectId, projectName, directory);
      await this.storage.updateDirectorySyncTime(
        projectId,
        directory.directoryPath
      );
    } else {
      await this.syncDirectory(project, directory);
    }

    return project;
  }

  async addDirectoryToProject(
    project: LinkedProjectV2,
    options: LinkDirectoryOptions
  ): Promise<void> {
    assertTrustedWorkspace();
    if (options.conflictStrategy === "skip") return;
    const directory: LinkedDirectory = {
      directoryPath: normalizePath(options.directoryPath),
      targetFile: options.targetFile || getTargetFile(),
      environments: options.environments || [getEnvironment()],
      displayName: options.displayName,
      lastSyncedAt: null,
      createdAt: Date.now(),
    };

    if (options.conflictStrategy === "backup") {
      const conflict = await this.checkForConflicts(
        options.directoryPath,
        directory.targetFile,
        directory.environments
      );
      if (conflict.hasConflict) {
        await this.backupEnvFile(
          options.directoryPath,
          directory.targetFile,
          directory.environments
        );
      }
    }

    await this.storage.addDirectoryToProject(project.projectId, directory);

    const updatedProject = await this.storage.getLinkedProjectV2(
      project.projectId
    );
    if (!updatedProject) {
      return;
    }

    if (options.conflictStrategy === "merge") {
      await this.mergeDirectory(
        project.projectId,
        project.projectName,
        directory
      );
      await this.storage.updateDirectorySyncTime(
        project.projectId,
        directory.directoryPath
      );
    } else {
      await this.syncDirectory(updatedProject, directory);
    }
  }

  async removeDirectoryFromProject(
    projectId: string,
    directoryPath: string
  ): Promise<void> {
    const project = await this.storage.getLinkedProjectV2(projectId);
    const directory = project?.directories.find((d) =>
      pathsEqual(d.directoryPath, directoryPath)
    );

    await this.storage.removeDirectoryFromProject(projectId, directoryPath);
    this.pruneMetadataHashes(projectId, directoryPath);
    await this.syncFlight.wait(`sync:${projectId}:${pathKey(directoryPath)}`);

    if (directory && shouldPreventCopyOnRevoke()) {
      await this.deleteSecretFilesFromDirectory(projectId, directory);
      await this.deleteEnvFileFromDirectory(directory);
    }
  }

  async getLinkedProjectV2ForWorkspace(): Promise<LinkedProjectV2 | null> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    const projects = await this.storage.getLinkedProjectsV2();
    return (
      projects.find((p) =>
        p.directories.some((d) =>
          folders.some((f) => isPathInside(d.directoryPath, f.uri.fsPath))
        )
      ) ?? null
    );
  }

  async getAllLinkedProjectsV2(): Promise<LinkedProjectV2[]> {
    return this.storage.getLinkedProjectsV2();
  }

  private async persistUnsyncFlag(projectId: string): Promise<void> {
    try {
      const flag = this.api.getAccessMeta(projectId)?.autoUnsyncOnClose;
      if (flag !== undefined) {
        await this.storage.setProjectUnsyncFlag(projectId, flag);
      }
    } catch {}
  }

  dispose(): void {
    this.stopPeriodicSync();
    this._onSyncComplete.dispose();
    this._onPermissionRevoked.dispose();
    this._onConnectionStateChanged.dispose();
  }
}
