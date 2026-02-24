import * as vscode from 'vscode'
import { AuthService } from '../services/auth'
import { SyncService } from '../services/sync'
import type { LinkedProject, LinkedProjectV2, SyncResult } from '../types'

export class StatusBarProvider {
  private statusBarItem: vscode.StatusBarItem
  private authService: AuthService
  private syncService: SyncService
  private isSyncing = false

  constructor(authService: AuthService, syncService: SyncService) {
    this.authService = authService
    this.syncService = syncService

    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    )
    this.statusBarItem.command = 'envConnect.showStatus'

    // Subscribe to events
    this.authService.onAuthStateChanged(() => this.update())
    this.syncService.onSyncComplete((result) => this.handleSyncComplete(result))
    this.syncService.onPermissionRevoked((project) => this.handlePermissionRevoked(project))

    this.update()
    this.statusBarItem.show()
  }

  async update(): Promise<void> {
    const isAuthenticated = await this.authService.isAuthenticated()

    if (!isAuthenticated) {
      this.statusBarItem.text = '$(plug) ENV Connect'
      this.statusBarItem.tooltip = 'Click to sign in'
      this.statusBarItem.backgroundColor = undefined
      return
    }

    const linkedProject = await this.syncService.getLinkedProject()

    if (!linkedProject) {
      this.statusBarItem.text = '$(check) ENV Connect'
      this.statusBarItem.tooltip = 'Signed in - No project linked'
      this.statusBarItem.backgroundColor = undefined
      return
    }

    if (this.isSyncing) {
      this.statusBarItem.text = '$(sync~spin) ENV Connect'
      this.statusBarItem.tooltip = 'Syncing variables...'
      this.statusBarItem.backgroundColor = undefined
      return
    }

    const syncInfo = linkedProject.lastSyncedAt
      ? `Last sync: ${this.formatTime(linkedProject.lastSyncedAt)}`
      : 'Never synced'

    this.statusBarItem.text = '$(cloud) ENV Connect'
    this.statusBarItem.tooltip = new vscode.MarkdownString(
      [
        `**${linkedProject.projectName}**`,
        '',
        `Organization: ${linkedProject.organizationName}`,
        `Environment: ${linkedProject.environment}`,
        `Target: ${linkedProject.targetFile}`,
        '',
        syncInfo,
      ].join('\n')
    )
    this.statusBarItem.backgroundColor = undefined
  }

  setSyncing(syncing: boolean): void {
    this.isSyncing = syncing
    this.update()
  }

  private handleSyncComplete(result: SyncResult): void {
    this.isSyncing = false
    this.update()

    if (result.success) {
      vscode.window.showInformationMessage(
        `Synced ${result.variablesCount} variables to ${result.targetFile}`
      )
    } else {
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.errorBackground'
      )
      vscode.window.showErrorMessage(`Sync failed: ${result.error}`)
    }
  }

  private handlePermissionRevoked(project: LinkedProject | LinkedProjectV2): void {
    this.statusBarItem.text = '$(warning) ENV Connect'
    this.statusBarItem.tooltip = `Access revoked for ${project.projectName}`
    this.statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    )
  }

  private formatTime(timestamp: number): string {
    const diff = Date.now() - timestamp
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) {
      return 'just now'
    }
    if (minutes < 60) {
      return `${minutes}m ago`
    }
    if (hours < 24) {
      return `${hours}h ago`
    }
    return new Date(timestamp).toLocaleDateString()
  }

  dispose(): void {
    this.statusBarItem.dispose()
  }
}
