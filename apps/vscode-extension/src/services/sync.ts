import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { ApiService } from "./api";
import { FileProtectionService, type ProtectionMode } from "./fileProtection";
import { ClipboardGuardService } from "./clipboardGuard";
import { ConvexService } from "./convex";
import { StorageService } from "../utils/storage";
import {
  getEnvironment,
  getTargetFile,
  getSyncInterval,
  shouldPreventCopyOnRevoke,
} from "../utils/config";
import { normalizePath, toPlatformPath, getDisplayPath } from "../utils/paths";
import { envFileNamesFor } from "../utils/envFiles";
import { recordManagedFile, forgetManagedFile } from "../utils/managedFiles";
import { captureError } from "../utils/sentry";
import {
  normalizeOrgRole,
  fileProtectionMode,
  type ProjectAccess as RoleAccess,
} from "../roles";
import type {
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
  SyncResult,
  EnvironmentVariable,
  ConflictCheckResult,
  ConflictStrategy,
  LinkDirectoryOptions,
} from "../types";

/** WebSocket connectivity state, surfaced to the status bar. */
export type SyncConnectionState = "connected" | "reconnecting" | "disconnected";

const ENV_FILE_HEADER = `# Envpilot - Synced Environment Variables
# DO NOT EDIT MANUALLY - Changes will be overwritten on next sync
# Project: {projectName}
# Environment: {environment}
# Synced at: {syncedAt}
#
# To modify variables, use the Envpilot dashboard.

`;

/**
 * First line of ENV_FILE_HEADER — the marker that identifies a file as
 * Envpilot-generated. Used before deleting a legacy/merged file so we never
 * clobber a file the user hand-authored.
 */
const ENV_FILE_MARKER = "# Envpilot - Synced Environment Variables";

/**
 * Workspace Trust choke point: Envpilot never writes secrets into a
 * Restricted Mode window. Every sync path funnels through the two env-file
 * writers, so this single guard covers them all. Cleanup (unsync purge,
 * revocation deletes) intentionally does NOT check trust — removing secrets
 * from an untrusted workspace is always allowed.
 */
function assertTrustedWorkspace(): void {
  if (!vscode.workspace.isTrusted) {
    throw new Error(
      "This workspace is in Restricted Mode — Envpilot will not write secrets here. Trust the workspace to sync."
    );
  }
}

/**
 * Sync service for managing environment variable synchronization
 */
export class SyncService {
  private api: ApiService;
  private storage: StorageService;
  private convexService: ConvexService | null = null;
  private fileProtection: FileProtectionService | null = null;
  private clipboardGuard: ClipboardGuardService | null = null;
  private metadataSubIds: string[] = [];
  private lastMetadataHash = new Map<string, string>();
  private syncDebounceTimers = new Map<string, NodeJS.Timeout>();
  /** Serializes refreshSubscriptions() so concurrent callers can't race on
   * subscription-id teardown/setup (mirrors StorageService.metadataWriteQueue). */
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

  /**
   * Set the ConvexService instance for reactive subscriptions.
   */
  setConvexService(convexService: ConvexService): void {
    this.convexService = convexService;
  }

  /**
   * Set the file protection service for read-only enforcement
   */
  setFileProtection(fileProtection: FileProtectionService): void {
    this.fileProtection = fileProtection;
  }

  /**
   * Set the clipboard guard service for copy/paste protection
   */
  setClipboardGuard(clipboardGuard: ClipboardGuardService): void {
    this.clipboardGuard = clipboardGuard;
  }

  /**
   * Start reactive sync via WebSocket subscriptions.
   * Subscribes to variable metadata changes — when variables are modified,
   * triggers an HTTP fetch for decrypted values from WorkOS Vault.
   */
  startPeriodicSync(): void {
    this.setupMetadataSubscriptions();
  }

  /**
   * Set up WebSocket subscriptions for variable metadata changes.
   */
  private async setupMetadataSubscriptions(): Promise<void> {
    if (!this.convexService) return;

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
            // Compute a hash to detect actual changes
            const hash = JSON.stringify(
              metadata.map((m) => `${m.key}:${m.version}`)
            );
            const key = `${project.projectId}:${directory.directoryPath}`;
            const prevHash = this.lastMetadataHash.get(key);

            if (prevHash !== undefined && prevHash !== hash) {
              // Variables changed — debounce and trigger HTTP fetch
              this.debouncedSync(project, directory);
            }
            this.lastMetadataHash.set(key, hash);
          }
        );

        this.metadataSubIds.push(subId);
      }
    }
  }

  /**
   * Debounced sync to avoid rapid re-fetches when multiple variables change at once.
   * Uses syncInterval setting as the minimum interval between vault fetch calls.
   */
  private debouncedSync(
    project: LinkedProjectV2,
    directory: LinkedDirectory
  ): void {
    const key = `${project.projectId}:${directory.directoryPath}`;
    const existing = this.syncDebounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Use a short debounce (2s) — much faster than old 300s polling
    const timer = setTimeout(async () => {
      this.syncDebounceTimers.delete(key);
      console.log(
        `[Sync] Variable change detected for ${project.projectName}, fetching decrypted values`
      );
      await this.syncDirectory(project, directory);
    }, 2000);

    this.syncDebounceTimers.set(key, timer);
  }

  /**
   * Refresh metadata subscriptions when projects are linked/unlinked.
   * Queued (not just awaited) so concurrent callers — e.g. a revocation
   * cleanup and a brand-new project link happening back to back — can't
   * interleave teardown/setup and orphan or drop a subscription.
   */
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

  /**
   * Tear down metadata subscriptions.
   */
  private teardownMetadataSubscriptions(): void {
    if (!this.convexService) return;
    for (const subId of this.metadataSubIds) {
      this.convexService.unsubscribe(subId);
    }
    this.metadataSubIds = [];
    this.lastMetadataHash.clear();

    for (const timer of this.syncDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.syncDebounceTimers.clear();
  }

  /**
   * Stop reactive sync — tear down subscriptions.
   */
  stopPeriodicSync(): void {
    this.teardownMetadataSubscriptions();
  }

  /**
   * Pause reactive sync — tears down the metadata subscriptions (and their
   * pending debounce timers) the same way `stopPeriodicSync()` does. Meant
   * for transient pauses (e.g. window idle) where the caller will `resume()`
   * later. Idempotent — a no-op if already paused (no active subscriptions).
   */
  pause(): void {
    if (this.metadataSubIds.length === 0) return;
    this.teardownMetadataSubscriptions();
  }

  /**
   * Resume reactive sync after `pause()` — re-establishes the metadata
   * subscriptions exactly the way `startPeriodicSync()` does (this simply
   * delegates to it). Idempotent — a no-op if already running.
   */
  resume(): void {
    if (this.metadataSubIds.length > 0) return;
    this.startPeriodicSync();
  }

  // ============================================
  // V1 Legacy Methods (kept for compatibility)
  // ============================================

  /**
   * Handle when permissions are revoked
   */
  private async handlePermissionRevoked(
    project: LinkedProject,
    reason: string
  ): Promise<void> {
    this._onPermissionRevoked.fire(project);

    // Delete the synced .env file if configured
    if (shouldPreventCopyOnRevoke()) {
      await this.deleteEnvFile(project);
    }

    // Remove the linked project
    await this.storage.removeLinkedProject(
      project.projectId,
      project.workspacePath
    );

    vscode.window.showWarningMessage(
      `Access revoked for "${project.projectName}": ${reason}. The synced .env file has been removed.`,
      "OK"
    );
  }

  /**
   * Sync variables for a linked project
   */
  async syncProject(project: LinkedProject): Promise<SyncResult> {
    try {
      // Check local expiry first
      if (project.expiresAt && Date.now() > project.expiresAt) {
        await this.handlePermissionRevoked(project, "Access token expired");
        return {
          success: false,
          variablesCount: 0,
          targetFile: project.targetFile,
          error: "Access token expired",
        };
      }

      // Fetch variables. The server authenticates via the WorkOS JWT and
      // rejects the request if the caller no longer has access, so a separate
      // token-validation round trip is unnecessary.
      const variables = await this.api.getVariables(
        project.projectId,
        project.environment
      );

      // Write to .env file
      await this.writeEnvFile(project, variables);

      // Update last synced timestamp
      await this.storage.updateLinkedProject(
        project.projectId,
        project.workspacePath,
        {
          lastSyncedAt: Date.now(),
        }
      );

      // Cache the server-resolved unsync-on-close flag so deactivate() can
      // act on it offline.
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

  /**
   * Sync variables for the current workspace
   */
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

  /**
   * Write environment variables to the .env file
   * Validates that the target path is within the workspace to prevent path traversal
   */
  private async writeEnvFile(
    project: LinkedProject,
    variables: EnvironmentVariable[]
  ): Promise<void> {
    assertTrustedWorkspace();
    const envFilePath = path.resolve(project.workspacePath, project.targetFile);
    const normalizedWorkspace = path.resolve(project.workspacePath);

    // Security: Ensure path doesn't escape workspace (path traversal protection)
    if (
      !envFilePath.startsWith(normalizedWorkspace + path.sep) &&
      envFilePath !== normalizedWorkspace
    ) {
      throw new Error("Target file path must be within workspace");
    }

    // Build file content
    let content = ENV_FILE_HEADER.replace("{projectName}", project.projectName)
      .replace("{environment}", project.environment)
      .replace("{syncedAt}", new Date().toISOString());

    // Group variables by sensitivity
    const regularVars = variables.filter((v) => !v.isSensitive);
    const sensitiveVars = variables.filter((v) => v.isSensitive);

    // Add regular variables
    if (regularVars.length > 0) {
      content += "# Application Variables\n";
      for (const variable of regularVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`;
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`;
      }
      content += "\n";
    }

    // Add sensitive variables
    if (sensitiveVars.length > 0) {
      content += "# Sensitive Variables (secrets)\n";
      for (const variable of sensitiveVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`;
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`;
      }
    }

    // Make writable before writing (in case it was previously set read-only)
    try {
      await fs.chmod(envFilePath, 0o644);
    } catch {
      // File may not exist yet
    }

    // Write file
    await fs.writeFile(envFilePath, content, "utf-8");
    await recordManagedFile(envFilePath, content);

    // Apply role-based file protection
    const protectionMode = this.resolveProtectionMode(
      project.projectId,
      variables
    );
    if (protectionMode !== "writable") {
      await fs.chmod(envFilePath, 0o444);
      if (this.fileProtection) {
        this.fileProtection.watchFile(
          envFilePath,
          async () => {
            await this.syncProject(project);
          },
          protectionMode
        );
      }
      // Register clipboard protection for non-writable files
      if (this.clipboardGuard) {
        this.clipboardGuard.protectFile(envFilePath, protectionMode);
      }
    } else {
      // Ensure writable files are unprotected from clipboard guard
      if (this.clipboardGuard) {
        this.clipboardGuard.unprotectFile(envFilePath);
      }
    }
  }

  /**
   * Build a unified ProjectAccess for THIS sync request, mirroring the CLI's
   * accessFromMeta (apps/cli/src/commands/pull.ts). Built fresh from the
   * role/projectRole that were just populated by the getVariables() call
   * this sync made (api.ts caches them as a side effect of that response),
   * not from a cache that could hold a value left over from an unrelated
   * project/org. `/api/extension/variables` doesn't send the additive
   * `unifiedRole`/`assigned`/`environmentScope`/`hasWriteAccess`/per-variable
   * `access` fields yet (unlike `/api/cli/variables`) — this reads them
   * defensively so the extension picks them up automatically, additively,
   * the moment the server route adds them, without another client change.
   */
  private buildProjectAccess(
    projectId: string,
    variables: EnvironmentVariable[]
  ): RoleAccess {
    // Prefer the authoritative unified fields the server returns alongside the
    // variables (populated on the same request — never stale). Fall back to the
    // legacy role/projectRole caches + per-variable access for older servers.
    const meta = this.api.getAccessMeta(projectId);
    const projectRole = this.api.getProjectRole(projectId);
    const role = normalizeOrgRole(
      meta?.unifiedRole ?? this.api.getUserRole(projectId)
    );
    return {
      role,
      // Owners are implicitly assigned to every project — the legacy server
      // sends no assignment info for them, so gating on projectRole here would
      // wrongly lock an owner's file read-only.
      assigned:
        role === "owner" || (meta?.assigned ?? projectRole !== undefined),
      environmentScope: meta?.environmentScope ?? null,
      hasWriteAccess:
        meta?.hasWriteAccess ?? variables.some((v) => v.access === "write"),
    };
  }

  /**
   * Determine the file protection mode for THIS sync's fetched variables —
   * never from a stale projectId-keyed cache read at an unrelated point in
   * time (see buildProjectAccess).
   */
  private resolveProtectionMode(
    projectId: string,
    variables: EnvironmentVariable[]
  ): ProtectionMode {
    // Capability map from the same response that delivered the variables —
    // when present it is the authority (registry roles, incl. custom ones).
    return fileProtectionMode(
      this.buildProjectAccess(projectId, variables),
      this.api.getAccessMeta(projectId)?.capabilities
    );
  }

  /**
   * Track WebSocket connectivity (set by RealTimeSyncService) so the status
   * bar can surface a silent sync failure instead of going quiet forever.
   */
  setConnectionState(state: SyncConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this._onConnectionStateChanged.fire(state);
  }

  getConnectionState(): SyncConnectionState {
    return this.connectionState;
  }

  /**
   * Format a value for .env file (handle quotes and special characters)
   */
  private formatValue(value: string): string {
    // Characters that require quoting in .env files
    const needsQuoting = /[\s#"'`$\\]|[\x00-\x1f]/;

    if (needsQuoting.test(value)) {
      // Escape backslashes first, then quotes, then newlines
      const escaped = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
      return `"${escaped}"`;
    }
    return value;
  }

  /**
   * Delete the synced .env file
   */
  private async deleteEnvFile(project: LinkedProject): Promise<void> {
    const envFilePath = path.resolve(project.workspacePath, project.targetFile);
    const normalizedWorkspace = path.resolve(project.workspacePath);

    // Security check before deletion
    if (
      !envFilePath.startsWith(normalizedWorkspace + path.sep) &&
      envFilePath !== normalizedWorkspace
    ) {
      return; // Don't delete files outside workspace
    }

    // Stop watching and clipboard protection before deletion
    if (this.fileProtection) {
      this.fileProtection.unwatchFile(envFilePath);
    }
    if (this.clipboardGuard) {
      this.clipboardGuard.unprotectFile(envFilePath);
    }

    try {
      await fs.access(envFilePath);
      // Make writable before deleting (read-only files can't be unlinked on some systems)
      await fs.chmod(envFilePath, 0o644);
      await fs.unlink(envFilePath);
    } catch {
      // File doesn't exist, nothing to delete
    }
    await forgetManagedFile(envFilePath);
  }

  /**
   * Link a project to the current workspace
   */
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

    // Sync immediately after linking
    await this.syncProject(linkedProject);

    return linkedProject;
  }

  /**
   * Unlink a project from the current workspace
   */
  async unlinkProject(projectId: string): Promise<void> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return;
    }

    const linkedProject =
      await this.storage.getLinkedProjectForWorkspace(workspacePath);
    if (linkedProject && linkedProject.projectId === projectId) {
      // Delete the .env file
      if (shouldPreventCopyOnRevoke()) {
        await this.deleteEnvFile(linkedProject);
      }

      await this.storage.removeLinkedProject(projectId, workspacePath);
    }
  }

  /**
   * Get the current workspace folder path
   */
  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }

  /**
   * Get the linked project for the current workspace
   */
  async getLinkedProject(): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return null;
    }
    return this.storage.getLinkedProjectForWorkspace(workspacePath);
  }

  // ============================================
  // V2 Methods (multi-directory support)
  // ============================================

  /**
   * Check for existing .env file conflicts across every file this directory
   * will write. Multi-env directories fan out to one file per environment, so
   * a conflict on ANY derived file counts. The result aggregates existing keys
   * across all conflicting files and reports the first existing file's path.
   */
  async checkForConflicts(
    directoryPath: string,
    targetFile: string,
    environments: string[]
  ): Promise<ConflictCheckResult> {
    const platformPath = toPlatformPath(directoryPath);
    const filenames = new Set(
      envFileNamesFor({ environments, targetFile }).values()
    );

    let firstExistingFile: string | undefined;
    const allKeys: string[] = [];
    let totalCount = 0;

    for (const filename of filenames) {
      const envFilePath = path.resolve(platformPath, filename);
      try {
        const content = await fs.readFile(envFilePath, "utf-8");
        const keys = this.parseEnvKeys(content);
        if (firstExistingFile === undefined) {
          firstExistingFile = envFilePath;
        }
        totalCount += keys.length;
        for (const key of keys) {
          if (!allKeys.includes(key)) {
            allKeys.push(key);
          }
        }
      } catch {
        // File doesn't exist — no conflict for this one.
      }
    }

    if (firstExistingFile === undefined) {
      return { hasConflict: false };
    }

    return {
      hasConflict: true,
      existingFile: firstExistingFile,
      existingVariableCount: totalCount,
      existingKeys: allKeys,
    };
  }

  /**
   * Parse variable keys from .env file content
   */
  private parseEnvKeys(content: string): string[] {
    const keys: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) {
          keys.push(match[1]);
        }
      }
    }

    return keys;
  }

  /**
   * Create a backup of every existing .env file this directory writes.
   * Returns the list of backup paths created (one per file that existed).
   */
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
        continue; // Nothing to back up.
      }
      const backupPath = `${envFilePath}.backup-${timestamp}`;
      await fs.copyFile(envFilePath, backupPath);
      // A backup of an Envpilot-synced file carries live secrets, so track it
      // for the uninstall purge. A user-authored file (no header) is their
      // data — never track, never delete.
      if (existingContent.startsWith(ENV_FILE_MARKER)) {
        await recordManagedFile(backupPath, existingContent);
      }
      backups.push(backupPath);
    }
    return backups;
  }

  /**
   * Parse .env file content into a Map
   */
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

          // Handle quoted values
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

  /**
   * Merge a single env's pulled variables into one on-disk file (new keys
   * override, existing keys preserved). `environment` is the single env name
   * used for the file header. See {@link mergeDirectory} for the fan-out.
   */
  async mergeEnvFiles(
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environment: string,
    newVariables: EnvironmentVariable[]
  ): Promise<void> {
    const envFilePath = path.resolve(toPlatformPath(directoryPath), targetFile);

    let existingVars: Map<string, string> = new Map();

    try {
      const content = await fs.readFile(envFilePath, "utf-8");
      existingVars = this.parseEnvFile(content);
    } catch {
      // File doesn't exist, that's fine
    }

    // Override with new variables
    for (const variable of newVariables) {
      existingVars.set(variable.key, variable.value);
    }

    // Build merged content
    let mergedContent = ENV_FILE_HEADER.replace("{projectName}", projectName)
      .replace("{environment}", environment)
      .replace("{syncedAt}", new Date().toISOString());

    for (const [key, value] of existingVars) {
      mergedContent += `${key}=${this.formatValue(value)}\n`;
    }

    await fs.writeFile(envFilePath, mergedContent, "utf-8");
    await recordManagedFile(envFilePath, mergedContent);
  }

  /**
   * Conflict-path "merge" for a whole directory: fetch every environment and
   * merge each into its corresponding derived file (no key prefixing, no
   * cross-env dedup). Mirrors the fan-out in syncDirectory but preserves
   * existing on-disk keys instead of overwriting the file.
   */
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
          directory.directoryPath,
          envToFile.get(env) as string,
          projectName,
          env,
          varsByEnv[i]
        )
      )
    );
  }

  /**
   * Sync a single directory within a project
   */
  async syncDirectory(
    project: LinkedProjectV2,
    directory: LinkedDirectory
  ): Promise<SyncResult> {
    // Derive one file per environment (single-env keeps the stored targetFile
    // for back-compat; multi-env fans out to .env.local/.env.<env>). NO key
    // prefixing, NO dedup across environments — each file is its own env.
    const envToFile = envFileNamesFor(directory);
    const envs = Array.from(envToFile.keys());
    const derivedFiles = Array.from(envToFile.values());

    try {
      // Fetch all environments in parallel. The server validates the access
      // token on every variables request, so a separate upfront validation
      // round trip is redundant — a revoked token surfaces as an error here.
      const varsByEnv = await Promise.all(
        envs.map((env) =>
          this.api.getVariables(project.projectId, env, undefined, {
            fresh: true,
          })
        )
      );

      // Write ONE FILE PER ENVIRONMENT. Per-file protection/clipboard guards
      // are registered inside writeEnvFileToDirectory (they're path-keyed, so
      // one call per file is correct). Collect per-file outcomes so a single
      // file failure is reported rather than swallowed.
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

      // Remove a stale merged file left over from the old single-file scheme
      // (only for multi-env dirs, and only if it carries our header).
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

      // Update last synced ONCE after all files written successfully.
      await this.storage.updateDirectorySyncTime(
        project.projectId,
        directory.directoryPath
      );

      // Cache the server-resolved unsync-on-close flag so deactivate() can
      // act on it offline.
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

  /**
   * Delete a stale merged file from the pre-fan-out single-file scheme.
   *
   * Only relevant for multi-env directories whose stored `targetFile` is NOT
   * one of the newly derived per-env filenames (e.g. an old `.env.local`
   * holding DEVELOPMENT_/STAGING_-prefixed junk when the derived set is
   * `.env.local`/`.env.staging`/`.env.production`, or a custom merged file).
   * Deletes only if the file carries the Envpilot header — a hand-authored
   * file with the same name is left untouched and logged.
   */
  private async cleanupStaleMergedFile(
    directory: LinkedDirectory,
    envToFile: Map<string, string>
  ): Promise<void> {
    if (directory.environments.length <= 1) return;

    const derived = new Set(envToFile.values());
    if (derived.has(directory.targetFile)) return;

    await this.unlinkDirFile(
      directory.directoryPath,
      directory.targetFile,
      true
    );
  }

  /**
   * Sync all directories for a project (in parallel — each directory
   * writes to its own file; metadata writes are serialized in storage)
   */
  async syncAllDirectories(project: LinkedProjectV2): Promise<SyncResult[]> {
    const results = await Promise.all(
      project.directories.map((directory) =>
        this.syncDirectory(project, directory)
      )
    );

    for (const result of results) {
      this._onSyncComplete.fire(result);
    }

    return results;
  }

  /**
   * Write env file to a specific directory
   */
  private async writeEnvFileToDirectory(
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environments: string,
    variables: EnvironmentVariable[],
    projectId?: string
  ): Promise<void> {
    assertTrustedWorkspace();
    const platformPath = toPlatformPath(directoryPath);
    const envFilePath = path.resolve(platformPath, targetFile);
    const normalizedDir = path.resolve(platformPath);

    // Security: Ensure path doesn't escape directory
    if (
      !envFilePath.startsWith(normalizedDir + path.sep) &&
      envFilePath !== normalizedDir
    ) {
      throw new Error("Target file path must be within directory");
    }

    // Build file content
    let content = ENV_FILE_HEADER.replace("{projectName}", projectName)
      .replace("{environment}", environments)
      .replace("{syncedAt}", new Date().toISOString());

    const regularVars = variables.filter((v) => !v.isSensitive);
    const sensitiveVars = variables.filter((v) => v.isSensitive);

    if (regularVars.length > 0) {
      content += "# Application Variables\n";
      for (const variable of regularVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`;
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`;
      }
      content += "\n";
    }

    if (sensitiveVars.length > 0) {
      content += "# Sensitive Variables (secrets)\n";
      for (const variable of sensitiveVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`;
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`;
      }
    }

    // Make writable before writing (in case it was previously set read-only)
    try {
      await fs.chmod(envFilePath, 0o644);
    } catch {
      // File may not exist yet
    }

    await fs.writeFile(envFilePath, content, "utf-8");
    await recordManagedFile(envFilePath, content);

    // Apply role-based file protection
    const protectionMode = projectId
      ? this.resolveProtectionMode(projectId, variables)
      : "readonly-with-request";
    if (protectionMode !== "writable") {
      await fs.chmod(envFilePath, 0o444);
      if (this.fileProtection) {
        const syncCallback = async () => {
          // Re-sync this specific directory
          if (projectId) {
            const project = await this.storage.getLinkedProjectV2(projectId);
            if (project) {
              const dir = project.directories.find(
                (d) =>
                  normalizePath(d.directoryPath) ===
                  normalizePath(directoryPath)
              );
              if (dir) {
                await this.syncDirectory(project, dir);
              }
            }
          }
        };
        this.fileProtection.watchFile(
          envFilePath,
          syncCallback,
          protectionMode
        );
      }
      // Register clipboard protection for non-writable files
      if (this.clipboardGuard) {
        this.clipboardGuard.protectFile(envFilePath, protectionMode);
      }
    } else {
      // Ensure writable files are unprotected from clipboard guard
      if (this.clipboardGuard) {
        this.clipboardGuard.unprotectFile(envFilePath);
      }
    }
  }

  /**
   * Delete env files from all directories when access is revoked.
   * Continues cleanup even if individual directories fail.
   */
  async cleanupAllDirectories(project: LinkedProjectV2): Promise<void> {
    const errors: Error[] = [];

    for (const directory of project.directories) {
      try {
        await this.deleteEnvFileFromDirectory(directory);
      } catch (err) {
        errors.push(err instanceof Error ? err : new Error(String(err)));
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to cleanup ${errors.length}/${project.directories.length} directories`
      );
    }
  }

  /**
   * Delete every env file a directory maps to.
   *
   * Removes each derived per-env file unconditionally (they're ours), plus the
   * legacy `targetFile` when it isn't already one of the derived names AND it
   * carries the Envpilot header (guards against nuking a user's file).
   */
  private async deleteEnvFileFromDirectory(
    directory: LinkedDirectory
  ): Promise<void> {
    const envToFile = envFileNamesFor(directory);
    const derived = new Set(envToFile.values());

    for (const filename of derived) {
      await this.unlinkDirFile(directory.directoryPath, filename, false);
    }

    // Legacy merged targetFile (multi-env with a custom name) — only if it's
    // Envpilot-generated.
    if (!derived.has(directory.targetFile)) {
      await this.unlinkDirFile(
        directory.directoryPath,
        directory.targetFile,
        true
      );
    }
  }

  /**
   * Delete a single file inside a linked directory, unwatching protection and
   * clipboard guards first. When `requireHeader` is set, the file is only
   * removed if it starts with the Envpilot header marker — otherwise it's left
   * in place and logged (never clobber a hand-authored file).
   */
  private async unlinkDirFile(
    directoryPath: string,
    filename: string,
    requireHeader: boolean
  ): Promise<void> {
    const platformPath = toPlatformPath(directoryPath);
    const filePath = path.resolve(platformPath, filename);
    const normalizedDir = path.resolve(platformPath);

    // Security check — never touch anything outside the directory.
    if (
      !filePath.startsWith(normalizedDir + path.sep) &&
      filePath !== normalizedDir
    ) {
      return;
    }

    if (requireHeader) {
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch {
        return; // Doesn't exist — nothing to clean up.
      }
      if (!content.startsWith(ENV_FILE_MARKER)) {
        console.warn(
          `[Sync] Leaving ${filePath} untouched — no Envpilot header, looks user-authored`
        );
        return;
      }
    }

    // Stop watching and clipboard protection before deletion.
    if (this.fileProtection) {
      this.fileProtection.unwatchFile(filePath);
    }
    if (this.clipboardGuard) {
      this.clipboardGuard.unprotectFile(filePath);
    }

    try {
      await fs.access(filePath);
      // Make writable before deleting (read-only files can't be unlinked on some systems).
      await fs.chmod(filePath, 0o644);
      await fs.unlink(filePath);
    } catch {
      // File doesn't exist.
    }
    await forgetManagedFile(filePath);
  }

  /**
   * Link a project with directory options (V2)
   */
  async linkProjectWithDirectory(
    projectId: string,
    projectName: string,
    organizationId: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number,
    options: LinkDirectoryOptions
  ): Promise<LinkedProjectV2 | null> {
    const directory: LinkedDirectory = {
      directoryPath: normalizePath(options.directoryPath),
      targetFile: options.targetFile || getTargetFile(),
      environments: options.environments || [getEnvironment()],
      displayName: options.displayName,
      lastSyncedAt: null,
      createdAt: Date.now(),
    };

    // Handle conflict strategy
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

    // Add to storage
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

    // Get the project to sync
    const project = await this.storage.getLinkedProjectV2(projectId);
    if (!project) {
      return null;
    }

    // Sync the directory
    if (options.conflictStrategy === "merge") {
      await this.mergeDirectory(projectId, projectName, directory);
      await this.storage.updateDirectorySyncTime(
        projectId,
        directory.directoryPath
      );
    } else if (options.conflictStrategy !== "skip") {
      await this.syncDirectory(project, directory);
    }

    return project;
  }

  /**
   * Add a directory to an existing project (V2)
   */
  async addDirectoryToProject(
    project: LinkedProjectV2,
    options: LinkDirectoryOptions
  ): Promise<void> {
    const directory: LinkedDirectory = {
      directoryPath: normalizePath(options.directoryPath),
      targetFile: options.targetFile || getTargetFile(),
      environments: options.environments || [getEnvironment()],
      displayName: options.displayName,
      lastSyncedAt: null,
      createdAt: Date.now(),
    };

    // Handle conflict strategy
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

    // Add to storage
    await this.storage.addDirectoryToProject(project.projectId, directory);

    // Get updated project
    const updatedProject = await this.storage.getLinkedProjectV2(
      project.projectId
    );
    if (!updatedProject) {
      return;
    }

    // Sync the new directory
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
    } else if (options.conflictStrategy !== "skip") {
      await this.syncDirectory(updatedProject, directory);
    }
  }

  /**
   * Remove a directory from a project (V2)
   */
  async removeDirectoryFromProject(
    projectId: string,
    directoryPath: string,
    deleteEnvFile = true
  ): Promise<void> {
    if (deleteEnvFile && shouldPreventCopyOnRevoke()) {
      const project = await this.storage.getLinkedProjectV2(projectId);
      if (project) {
        const directory = project.directories.find(
          (d) => normalizePath(d.directoryPath) === normalizePath(directoryPath)
        );
        if (directory) {
          await this.deleteEnvFileFromDirectory(directory);
        }
      }
    }

    await this.storage.removeDirectoryFromProject(projectId, directoryPath);
  }

  /**
   * Get the linked project for a directory (V2)
   */
  async getLinkedProjectForDirectory(
    directoryPath: string
  ): Promise<LinkedProjectV2 | null> {
    return this.storage.getProjectForDirectory(directoryPath);
  }

  /**
   * Get linked project V2 for current workspace
   */
  async getLinkedProjectV2ForWorkspace(): Promise<LinkedProjectV2 | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      return null;
    }
    return this.storage.getProjectForDirectory(workspacePath);
  }

  /**
   * Get all linked projects V2
   */
  async getAllLinkedProjectsV2(): Promise<LinkedProjectV2[]> {
    return this.storage.getLinkedProjectsV2();
  }

  /**
   * Sync current workspace using V2 format
   */
  async syncCurrentWorkspaceV2(): Promise<SyncResult[] | null> {
    const workspacePath = this.getCurrentWorkspacePath();
    if (!workspacePath) {
      vscode.window.showWarningMessage("No workspace folder open");
      return null;
    }

    const linkedProject =
      await this.storage.getProjectForDirectory(workspacePath);
    if (!linkedProject) {
      vscode.window.showWarningMessage(
        'No project linked to this workspace. Use "Envpilot: Link Project" to link a project.'
      );
      return null;
    }

    return this.syncAllDirectories(linkedProject);
  }

  /**
   * Persist the unsync-on-close flag the last getVariables() call resolved
   * for this project (cacheAccessMeta populates it on the same request).
   * Best-effort — never fails a sync.
   */
  private async persistUnsyncFlag(projectId: string): Promise<void> {
    try {
      const flag = this.api.getAccessMeta(projectId)?.autoUnsyncOnClose;
      if (flag !== undefined) {
        await this.storage.setProjectUnsyncFlag(projectId, flag);
      }
    } catch {
      // Flag caching must never break a sync; deactivate() falls back to
      // the secure default (true) when no cached value exists.
    }
  }

  dispose(): void {
    this.stopPeriodicSync();
    this._onSyncComplete.dispose();
    this._onPermissionRevoked.dispose();
    this._onConnectionStateChanged.dispose();
  }
}
