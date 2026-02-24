import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { ApiService } from './api'
import { StorageService } from '../utils/storage'
import {
  getEnvironment,
  getTargetFile,
  getSyncInterval,
  shouldPreventCopyOnRevoke,
} from '../utils/config'
import { normalizePath, toPlatformPath, getDisplayPath } from '../utils/paths'
import type {
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
  SyncResult,
  EnvironmentVariable,
  TokenValidation,
  ConflictCheckResult,
  ConflictStrategy,
  LinkDirectoryOptions,
} from '../types'

const ENV_FILE_HEADER = `# ENV Connect - Synced Environment Variables
# DO NOT EDIT MANUALLY - Changes will be overwritten on next sync
# Project: {projectName}
# Environment: {environment}
# Synced at: {syncedAt}
#
# To modify variables, use the ENV Connect dashboard.

`

/**
 * Sync service for managing environment variable synchronization
 */
export class SyncService {
  private api: ApiService
  private storage: StorageService
  private syncTimer: NodeJS.Timeout | null = null
  private failureCount = 0
  private readonly MAX_BACKOFF_MULTIPLIER = 8
  private _onSyncComplete = new vscode.EventEmitter<SyncResult>()
  private _onPermissionRevoked = new vscode.EventEmitter<LinkedProject | LinkedProjectV2>()

  readonly onSyncComplete = this._onSyncComplete.event
  readonly onPermissionRevoked = this._onPermissionRevoked.event

  constructor(api: ApiService, storage: StorageService) {
    this.api = api
    this.storage = storage
  }

  /**
   * Start periodic sync checking with exponential backoff on failures
   */
  startPeriodicSync(): void {
    if (this.syncTimer) {
      return
    }
    this.scheduleNextSync()
  }

  /**
   * Schedule the next sync with backoff
   */
  private scheduleNextSync(): void {
    const baseInterval = getSyncInterval()
    const backoffMultiplier = Math.min(Math.pow(2, this.failureCount), this.MAX_BACKOFF_MULTIPLIER)
    const interval = baseInterval * backoffMultiplier

    this.syncTimer = setTimeout(async () => {
      const success = await this.checkAllLinkedProjectsV2()
      this.failureCount = success ? 0 : this.failureCount + 1
      this.scheduleNextSync()
    }, interval)
  }

  /**
   * Stop periodic sync checking
   */
  stopPeriodicSync(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer)
      this.syncTimer = null
    }
    this.failureCount = 0
  }

  // ============================================
  // V1 Legacy Methods (kept for compatibility)
  // ============================================

  /**
   * Check all linked projects for permission changes
   * Returns true if all checks succeeded, false if any failed
   */
  async checkAllLinkedProjects(): Promise<boolean> {
    const linkedProjects = await this.storage.getLinkedProjects()
    let allSuccessful = true

    for (const project of linkedProjects) {
      try {
        await this.checkProjectPermissions(project)
      } catch (error) {
        console.error(`Failed to check permissions for ${project.projectName}:`, error)
        allSuccessful = false
      }
    }

    return allSuccessful
  }

  /**
   * Check if permissions are still valid for a linked project
   */
  async checkProjectPermissions(project: LinkedProject): Promise<TokenValidation> {
    // Check local expiry first to avoid unnecessary network calls
    if (project.expiresAt && Date.now() > project.expiresAt) {
      await this.handlePermissionRevoked(project, 'Access token expired')
      return { valid: false, reason: 'Access token expired' }
    }

    const validation = await this.api.validateAccessToken(project.accessToken)

    if (!validation.valid) {
      // Permissions have been revoked
      await this.handlePermissionRevoked(project, validation.reason || 'Unknown')
    }

    return validation
  }

  /**
   * Handle when permissions are revoked
   */
  private async handlePermissionRevoked(project: LinkedProject, reason: string): Promise<void> {
    this._onPermissionRevoked.fire(project)

    // Delete the synced .env file if configured
    if (shouldPreventCopyOnRevoke()) {
      await this.deleteEnvFile(project)
    }

    // Remove the linked project
    await this.storage.removeLinkedProject(project.projectId, project.workspacePath)

    vscode.window.showWarningMessage(
      `Access revoked for "${project.projectName}": ${reason}. The synced .env file has been removed.`,
      'OK'
    )
  }

  /**
   * Sync variables for a linked project
   */
  async syncProject(project: LinkedProject): Promise<SyncResult> {
    try {
      // Check local expiry first
      if (project.expiresAt && Date.now() > project.expiresAt) {
        await this.handlePermissionRevoked(project, 'Access token expired')
        return {
          success: false,
          variablesCount: 0,
          targetFile: project.targetFile,
          error: 'Access token expired',
        }
      }

      // Validate token with server
      const validation = await this.api.validateAccessToken(project.accessToken)

      if (!validation.valid) {
        await this.handlePermissionRevoked(project, validation.reason || 'Unknown')
        return {
          success: false,
          variablesCount: 0,
          targetFile: project.targetFile,
          error: validation.reason,
        }
      }

      // Fetch variables
      const variables = await this.api.getVariables(
        project.projectId,
        project.environment,
        project.accessToken
      )

      // Write to .env file
      await this.writeEnvFile(project, variables)

      // Update last synced timestamp
      await this.storage.updateLinkedProject(project.projectId, project.workspacePath, {
        lastSyncedAt: Date.now(),
      })

      // Update last used on server
      await this.api.updateLastUsed(project.accessToken)

      const result: SyncResult = {
        success: true,
        variablesCount: variables.length,
        targetFile: project.targetFile,
      }

      this._onSyncComplete.fire(result)
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const result: SyncResult = {
        success: false,
        variablesCount: 0,
        targetFile: project.targetFile,
        error: errorMessage,
      }

      this._onSyncComplete.fire(result)
      return result
    }
  }

  /**
   * Sync variables for the current workspace
   */
  async syncCurrentWorkspace(): Promise<SyncResult | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      vscode.window.showWarningMessage('No workspace folder open')
      return null
    }

    const linkedProject = await this.storage.getLinkedProjectForWorkspace(workspacePath)
    if (!linkedProject) {
      vscode.window.showWarningMessage(
        'No project linked to this workspace. Use "ENV Connect: Link Project" to link a project.'
      )
      return null
    }

    return this.syncProject(linkedProject)
  }

  /**
   * Write environment variables to the .env file
   * Validates that the target path is within the workspace to prevent path traversal
   */
  private async writeEnvFile(
    project: LinkedProject,
    variables: EnvironmentVariable[]
  ): Promise<void> {
    const envFilePath = path.resolve(project.workspacePath, project.targetFile)
    const normalizedWorkspace = path.resolve(project.workspacePath)

    // Security: Ensure path doesn't escape workspace (path traversal protection)
    if (
      !envFilePath.startsWith(normalizedWorkspace + path.sep) &&
      envFilePath !== normalizedWorkspace
    ) {
      throw new Error('Target file path must be within workspace')
    }

    // Build file content
    let content = ENV_FILE_HEADER.replace('{projectName}', project.projectName)
      .replace('{environment}', project.environment)
      .replace('{syncedAt}', new Date().toISOString())

    // Group variables by sensitivity
    const regularVars = variables.filter((v) => !v.isSensitive)
    const sensitiveVars = variables.filter((v) => v.isSensitive)

    // Add regular variables
    if (regularVars.length > 0) {
      content += '# Application Variables\n'
      for (const variable of regularVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`
      }
      content += '\n'
    }

    // Add sensitive variables
    if (sensitiveVars.length > 0) {
      content += '# Sensitive Variables (secrets)\n'
      for (const variable of sensitiveVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`
      }
    }

    // Write file
    await fs.writeFile(envFilePath, content, 'utf-8')
  }

  /**
   * Format a value for .env file (handle quotes and special characters)
   */
  private formatValue(value: string): string {
    // Characters that require quoting in .env files
    const needsQuoting = /[\s#"'`$\\]|[\x00-\x1f]/

    if (needsQuoting.test(value)) {
      // Escape backslashes first, then quotes, then newlines
      const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
      return `"${escaped}"`
    }
    return value
  }

  /**
   * Delete the synced .env file
   */
  private async deleteEnvFile(project: LinkedProject): Promise<void> {
    const envFilePath = path.resolve(project.workspacePath, project.targetFile)
    const normalizedWorkspace = path.resolve(project.workspacePath)

    // Security check before deletion
    if (
      !envFilePath.startsWith(normalizedWorkspace + path.sep) &&
      envFilePath !== normalizedWorkspace
    ) {
      return // Don't delete files outside workspace
    }

    try {
      await fs.access(envFilePath)
      await fs.unlink(envFilePath)
    } catch {
      // File doesn't exist, nothing to delete
    }
  }

  /**
   * Link a project to the current workspace
   */
  async linkProject(
    projectId: string,
    projectName: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number
  ): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      vscode.window.showWarningMessage('No workspace folder open')
      return null
    }

    const linkedProject: LinkedProject = {
      projectId,
      projectName,
      organizationName,
      accessToken,
      expiresAt,
      environment: getEnvironment(),
      targetFile: getTargetFile(),
      lastSyncedAt: null,
      workspacePath,
    }

    await this.storage.addLinkedProject(linkedProject)

    // Sync immediately after linking
    await this.syncProject(linkedProject)

    return linkedProject
  }

  /**
   * Unlink a project from the current workspace
   */
  async unlinkProject(projectId: string): Promise<void> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      return
    }

    const linkedProject = await this.storage.getLinkedProjectForWorkspace(workspacePath)
    if (linkedProject && linkedProject.projectId === projectId) {
      // Delete the .env file
      if (shouldPreventCopyOnRevoke()) {
        await this.deleteEnvFile(linkedProject)
      }

      await this.storage.removeLinkedProject(projectId, workspacePath)
    }
  }

  /**
   * Get the current workspace folder path
   */
  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders
    if (!folders || folders.length === 0) {
      return null
    }
    return folders[0].uri.fsPath
  }

  /**
   * Get the linked project for the current workspace
   */
  async getLinkedProject(): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      return null
    }
    return this.storage.getLinkedProjectForWorkspace(workspacePath)
  }

  // ============================================
  // V2 Methods (multi-directory support)
  // ============================================

  /**
   * Check all linked projects V2 for permission changes
   */
  async checkAllLinkedProjectsV2(): Promise<boolean> {
    const linkedProjects = await this.storage.getLinkedProjectsV2()
    let allSuccessful = true

    for (const project of linkedProjects) {
      try {
        await this.checkProjectPermissionsV2(project)
      } catch (error) {
        console.error(`Failed to check permissions for ${project.projectName}:`, error)
        allSuccessful = false
      }
    }

    return allSuccessful
  }

  /**
   * Check permissions for a V2 linked project
   */
  async checkProjectPermissionsV2(project: LinkedProjectV2): Promise<TokenValidation> {
    // Check local expiry first
    if (project.expiresAt && Date.now() > project.expiresAt) {
      await this.handlePermissionRevokedV2(project, 'Access token expired')
      return { valid: false, reason: 'Access token expired' }
    }

    const validation = await this.api.validateAccessToken(project.accessToken)

    if (!validation.valid) {
      await this.handlePermissionRevokedV2(project, validation.reason || 'Unknown')
    }

    return validation
  }

  /**
   * Handle permission revocation for V2 project
   */
  private async handlePermissionRevokedV2(
    project: LinkedProjectV2,
    reason: string
  ): Promise<void> {
    this._onPermissionRevoked.fire(project)

    // Delete all synced .env files if configured
    if (shouldPreventCopyOnRevoke()) {
      await this.cleanupAllDirectories(project)
    }

    // Remove the linked project
    await this.storage.removeLinkedProjectV2(project.projectId)

    vscode.window.showWarningMessage(
      `Access revoked for "${project.projectName}": ${reason}. All synced .env files have been removed.`,
      'OK'
    )
  }

  /**
   * Check for existing .env file conflicts
   */
  async checkForConflicts(directoryPath: string, targetFile: string): Promise<ConflictCheckResult> {
    const envFilePath = path.resolve(toPlatformPath(directoryPath), targetFile)

    try {
      const content = await fs.readFile(envFilePath, 'utf-8')
      const keys = this.parseEnvKeys(content)

      return {
        hasConflict: true,
        existingFile: envFilePath,
        existingVariableCount: keys.length,
        existingKeys: keys,
      }
    } catch {
      return { hasConflict: false }
    }
  }

  /**
   * Parse variable keys from .env file content
   */
  private parseEnvKeys(content: string): string[] {
    const keys: string[] = []
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/)
        if (match) {
          keys.push(match[1])
        }
      }
    }

    return keys
  }

  /**
   * Create a backup of an existing .env file
   */
  async backupEnvFile(directoryPath: string, targetFile: string): Promise<string> {
    const envFilePath = path.resolve(toPlatformPath(directoryPath), targetFile)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${envFilePath}.backup-${timestamp}`

    await fs.copyFile(envFilePath, backupPath)
    return backupPath
  }

  /**
   * Parse .env file content into a Map
   */
  private parseEnvFile(content: string): Map<string, string> {
    const vars = new Map<string, string>()
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const eqIndex = trimmed.indexOf('=')
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex)
          let value = trimmed.substring(eqIndex + 1)

          // Handle quoted values
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1)
          }

          vars.set(key, value)
        }
      }
    }

    return vars
  }

  /**
   * Merge existing .env file with new variables
   */
  async mergeEnvFiles(
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environments: string,
    newVariables: EnvironmentVariable[]
  ): Promise<void> {
    const envFilePath = path.resolve(toPlatformPath(directoryPath), targetFile)

    let existingVars: Map<string, string> = new Map()

    try {
      const content = await fs.readFile(envFilePath, 'utf-8')
      existingVars = this.parseEnvFile(content)
    } catch {
      // File doesn't exist, that's fine
    }

    // Override with new variables
    for (const variable of newVariables) {
      existingVars.set(variable.key, variable.value)
    }

    // Build merged content
    let mergedContent = ENV_FILE_HEADER.replace('{projectName}', projectName)
      .replace('{environment}', environments)
      .replace('{syncedAt}', new Date().toISOString())

    for (const [key, value] of existingVars) {
      mergedContent += `${key}=${this.formatValue(value)}\n`
    }

    await fs.writeFile(envFilePath, mergedContent, 'utf-8')
  }

  /**
   * Sync a single directory within a project
   */
  async syncDirectory(project: LinkedProjectV2, directory: LinkedDirectory): Promise<SyncResult> {
    try {
      // Validate token first
      const validation = await this.api.validateAccessToken(project.accessToken)
      if (!validation.valid) {
        return {
          success: false,
          variablesCount: 0,
          targetFile: directory.targetFile,
          error: validation.reason,
        }
      }

      // Fetch variables for specified environments
      const allVariables: EnvironmentVariable[] = []
      for (const env of directory.environments) {
        const vars = await this.api.getVariables(project.projectId, env, project.accessToken)
        // Add with environment prefix if multiple environments
        if (directory.environments.length > 1) {
          for (const v of vars) {
            allVariables.push({
              ...v,
              key: `${env.toUpperCase()}_${v.key}`,
            })
          }
        } else {
          allVariables.push(...vars)
        }
      }

      // Deduplicate by key (last wins)
      const uniqueVars = new Map<string, EnvironmentVariable>()
      for (const v of allVariables) {
        uniqueVars.set(v.key, v)
      }

      // Write to directory
      await this.writeEnvFileToDirectory(
        directory.directoryPath,
        directory.targetFile,
        project.projectName,
        directory.environments.join(', '),
        Array.from(uniqueVars.values())
      )

      // Update last synced
      await this.storage.updateDirectorySyncTime(project.projectId, directory.directoryPath)

      // Update last used on server
      await this.api.updateLastUsed(project.accessToken)

      return {
        success: true,
        variablesCount: uniqueVars.size,
        targetFile: directory.targetFile,
      }
    } catch (error) {
      return {
        success: false,
        variablesCount: 0,
        targetFile: directory.targetFile,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Sync all directories for a project
   */
  async syncAllDirectories(project: LinkedProjectV2): Promise<SyncResult[]> {
    const results: SyncResult[] = []

    for (const directory of project.directories) {
      const result = await this.syncDirectory(project, directory)
      results.push(result)
      this._onSyncComplete.fire(result)
    }

    return results
  }

  /**
   * Write env file to a specific directory
   */
  private async writeEnvFileToDirectory(
    directoryPath: string,
    targetFile: string,
    projectName: string,
    environments: string,
    variables: EnvironmentVariable[]
  ): Promise<void> {
    const platformPath = toPlatformPath(directoryPath)
    const envFilePath = path.resolve(platformPath, targetFile)
    const normalizedDir = path.resolve(platformPath)

    // Security: Ensure path doesn't escape directory
    if (!envFilePath.startsWith(normalizedDir + path.sep) && envFilePath !== normalizedDir) {
      throw new Error('Target file path must be within directory')
    }

    // Build file content
    let content = ENV_FILE_HEADER.replace('{projectName}', projectName)
      .replace('{environment}', environments)
      .replace('{syncedAt}', new Date().toISOString())

    const regularVars = variables.filter((v) => !v.isSensitive)
    const sensitiveVars = variables.filter((v) => v.isSensitive)

    if (regularVars.length > 0) {
      content += '# Application Variables\n'
      for (const variable of regularVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`
      }
      content += '\n'
    }

    if (sensitiveVars.length > 0) {
      content += '# Sensitive Variables (secrets)\n'
      for (const variable of sensitiveVars) {
        if (variable.description) {
          content += `# ${variable.description}\n`
        }
        content += `${variable.key}=${this.formatValue(variable.value)}\n`
      }
    }

    await fs.writeFile(envFilePath, content, 'utf-8')
  }

  /**
   * Delete env files from all directories when access is revoked
   */
  async cleanupAllDirectories(project: LinkedProjectV2): Promise<void> {
    for (const directory of project.directories) {
      await this.deleteEnvFileFromDirectory(directory.directoryPath, directory.targetFile)
    }
  }

  /**
   * Delete env file from a specific directory
   */
  private async deleteEnvFileFromDirectory(
    directoryPath: string,
    targetFile: string
  ): Promise<void> {
    const platformPath = toPlatformPath(directoryPath)
    const envFilePath = path.resolve(platformPath, targetFile)
    const normalizedDir = path.resolve(platformPath)

    // Security check
    if (!envFilePath.startsWith(normalizedDir + path.sep) && envFilePath !== normalizedDir) {
      return
    }

    try {
      await fs.access(envFilePath)
      await fs.unlink(envFilePath)
    } catch {
      // File doesn't exist
    }
  }

  /**
   * Link a project with directory options (V2)
   */
  async linkProjectWithDirectory(
    projectId: string,
    projectName: string,
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
    }

    // Handle conflict strategy
    if (options.conflictStrategy === 'backup') {
      const conflict = await this.checkForConflicts(
        options.directoryPath,
        directory.targetFile
      )
      if (conflict.hasConflict) {
        await this.backupEnvFile(options.directoryPath, directory.targetFile)
      }
    }

    // Add to storage
    await this.storage.addLinkedProjectV2(
      projectId,
      projectName,
      organizationName,
      accessToken,
      expiresAt,
      directory,
      getEnvironment()
    )

    // Get the project to sync
    const project = await this.storage.getLinkedProjectV2(projectId)
    if (!project) {
      return null
    }

    // Sync the directory
    if (options.conflictStrategy === 'merge') {
      const variables = await this.api.getVariables(
        projectId,
        directory.environments[0],
        accessToken
      )
      await this.mergeEnvFiles(
        directory.directoryPath,
        directory.targetFile,
        projectName,
        directory.environments.join(', '),
        variables
      )
      await this.storage.updateDirectorySyncTime(projectId, directory.directoryPath)
    } else if (options.conflictStrategy !== 'skip') {
      await this.syncDirectory(project, directory)
    }

    return project
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
    }

    // Handle conflict strategy
    if (options.conflictStrategy === 'backup') {
      const conflict = await this.checkForConflicts(
        options.directoryPath,
        directory.targetFile
      )
      if (conflict.hasConflict) {
        await this.backupEnvFile(options.directoryPath, directory.targetFile)
      }
    }

    // Add to storage
    await this.storage.addDirectoryToProject(project.projectId, directory)

    // Get updated project
    const updatedProject = await this.storage.getLinkedProjectV2(project.projectId)
    if (!updatedProject) {
      return
    }

    // Sync the new directory
    if (options.conflictStrategy === 'merge') {
      const variables = await this.api.getVariables(
        project.projectId,
        directory.environments[0],
        project.accessToken
      )
      await this.mergeEnvFiles(
        directory.directoryPath,
        directory.targetFile,
        project.projectName,
        directory.environments.join(', '),
        variables
      )
      await this.storage.updateDirectorySyncTime(project.projectId, directory.directoryPath)
    } else if (options.conflictStrategy !== 'skip') {
      await this.syncDirectory(updatedProject, directory)
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
      const project = await this.storage.getLinkedProjectV2(projectId)
      if (project) {
        const directory = project.directories.find(
          (d) => normalizePath(d.directoryPath) === normalizePath(directoryPath)
        )
        if (directory) {
          await this.deleteEnvFileFromDirectory(directoryPath, directory.targetFile)
        }
      }
    }

    await this.storage.removeDirectoryFromProject(projectId, directoryPath)
  }

  /**
   * Get the linked project for a directory (V2)
   */
  async getLinkedProjectForDirectory(directoryPath: string): Promise<LinkedProjectV2 | null> {
    return this.storage.getProjectForDirectory(directoryPath)
  }

  /**
   * Get linked project V2 for current workspace
   */
  async getLinkedProjectV2ForWorkspace(): Promise<LinkedProjectV2 | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      return null
    }
    return this.storage.getProjectForDirectory(workspacePath)
  }

  /**
   * Sync current workspace using V2 format
   */
  async syncCurrentWorkspaceV2(): Promise<SyncResult[] | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      vscode.window.showWarningMessage('No workspace folder open')
      return null
    }

    const linkedProject = await this.storage.getProjectForDirectory(workspacePath)
    if (!linkedProject) {
      vscode.window.showWarningMessage(
        'No project linked to this workspace. Use "ENV Connect: Link Project" to link a project.'
      )
      return null
    }

    return this.syncAllDirectories(linkedProject)
  }

  dispose(): void {
    this.stopPeriodicSync()
    this._onSyncComplete.dispose()
    this._onPermissionRevoked.dispose()
  }
}
