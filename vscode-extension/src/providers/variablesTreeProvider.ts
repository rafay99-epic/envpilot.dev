import * as vscode from 'vscode'
import { ApiService } from '../services/api'
import { StorageService } from '../utils/storage'
import type { EnvironmentVariable, LinkedProject } from '../types'

export class VariablesTreeProvider implements vscode.TreeDataProvider<VariableTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<VariableTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  private api: ApiService
  private storage: StorageService
  private variables: EnvironmentVariable[] = []

  constructor(api: ApiService, storage: StorageService) {
    this.api = api
    this.storage = storage
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: VariableTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: VariableTreeItem): Promise<VariableTreeItem[]> {
    if (element) {
      // Variables don't have children
      return []
    }

    const linkedProject = await this.getLinkedProject()
    if (!linkedProject) {
      return [
        new VariableTreeItem(
          'No project linked',
          vscode.TreeItemCollapsibleState.None,
          'message',
          undefined,
          'Link a project to view variables'
        ),
      ]
    }

    try {
      this.variables = await this.api.getVariables(
        linkedProject.projectId,
        linkedProject.environment,
        linkedProject.accessToken
      )

      if (this.variables.length === 0) {
        return [
          new VariableTreeItem(
            'No variables',
            vscode.TreeItemCollapsibleState.None,
            'message',
            undefined,
            `No variables for ${linkedProject.environment} environment`
          ),
        ]
      }

      // Group by sensitivity
      const regularVars = this.variables.filter((v) => !v.isSensitive)
      const sensitiveVars = this.variables.filter((v) => v.isSensitive)

      const items: VariableTreeItem[] = []

      // Add environment header
      items.push(
        new VariableTreeItem(
          `Environment: ${linkedProject.environment}`,
          vscode.TreeItemCollapsibleState.None,
          'header',
          undefined,
          `${this.variables.length} variables`
        )
      )

      // Add regular variables
      for (const variable of regularVars) {
        items.push(
          new VariableTreeItem(
            variable.key,
            vscode.TreeItemCollapsibleState.None,
            'variable',
            variable
          )
        )
      }

      // Add sensitive variables with a separator
      if (sensitiveVars.length > 0) {
        items.push(
          new VariableTreeItem(
            'Sensitive',
            vscode.TreeItemCollapsibleState.None,
            'separator',
            undefined,
            `${sensitiveVars.length} secrets`
          )
        )

        for (const variable of sensitiveVars) {
          items.push(
            new VariableTreeItem(
              variable.key,
              vscode.TreeItemCollapsibleState.None,
              'sensitive',
              variable
            )
          )
        }
      }

      return items
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return [
        new VariableTreeItem(
          `Error: ${message}`,
          vscode.TreeItemCollapsibleState.None,
          'error'
        ),
      ]
    }
  }

  private async getLinkedProject(): Promise<LinkedProject | null> {
    const workspacePath = this.getCurrentWorkspacePath()
    if (!workspacePath) {
      return null
    }
    return await this.storage.getLinkedProjectForWorkspace(workspacePath)
  }

  private getCurrentWorkspacePath(): string | null {
    const folders = vscode.workspace.workspaceFolders
    if (!folders || folders.length === 0) {
      return null
    }
    return folders[0].uri.fsPath
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose()
  }
}

export class VariableTreeItem extends vscode.TreeItem {
  type: 'variable' | 'sensitive' | 'header' | 'separator' | 'message' | 'error'
  variable?: EnvironmentVariable

  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    type: 'variable' | 'sensitive' | 'header' | 'separator' | 'message' | 'error',
    variable?: EnvironmentVariable,
    description?: string
  ) {
    super(label, collapsibleState)
    this.type = type
    this.variable = variable
    this.description = description || variable?.description || undefined

    // Set icons
    switch (type) {
      case 'variable':
        this.iconPath = new vscode.ThemeIcon('symbol-variable')
        this.tooltip = this.createTooltip(variable)
        break
      case 'sensitive':
        this.iconPath = new vscode.ThemeIcon('lock')
        this.tooltip = this.createTooltip(variable, true)
        break
      case 'header':
        this.iconPath = new vscode.ThemeIcon('server-environment')
        break
      case 'separator':
        this.iconPath = new vscode.ThemeIcon('shield')
        break
      case 'message':
        this.iconPath = new vscode.ThemeIcon('info')
        break
      case 'error':
        this.iconPath = new vscode.ThemeIcon('error')
        break
    }

    this.contextValue = type
  }

  private createTooltip(variable?: EnvironmentVariable, isSensitive = false): string {
    if (!variable) {
      return ''
    }

    const lines = [
      `**${variable.key}**`,
      '',
      isSensitive ? '*(Sensitive value hidden)*' : `Value: \`${this.truncateValue(variable.value)}\``,
      '',
      `Environments: ${variable.environments.join(', ')}`,
      `Version: ${variable.version}`,
    ]

    if (variable.description) {
      lines.push('', variable.description)
    }

    return new vscode.MarkdownString(lines.join('\n')).value
  }

  private truncateValue(value: string, maxLength = 50): string {
    if (value.length <= maxLength) {
      return value
    }
    return value.substring(0, maxLength) + '...'
  }
}
