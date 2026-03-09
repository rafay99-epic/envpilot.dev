import * as vscode from "vscode";
import { SyncService } from "../services/sync";
import type {
  Project,
  Organization,
  ConflictStrategy,
  LinkDirectoryOptions,
  ConflictCheckResult,
} from "../types";
import { getDisplayPath, normalizePath } from "../utils/paths";
import { getEnvironment, getTargetFile } from "../utils/config";

const AVAILABLE_ENVIRONMENTS = ["development", "staging", "production"];

/**
 * Dialog for linking projects with enhanced directory selection
 */
export class LinkProjectDialog {
  private syncService: SyncService;

  constructor(syncService: SyncService) {
    this.syncService = syncService;
  }

  /**
   * Show directory selection dialog
   */
  async selectDirectory(): Promise<string | undefined> {
    const options: vscode.OpenDialogOptions = {
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select Directory to Link",
      title: "Select Project Directory",
    };

    // Default to current workspace if available
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      options.defaultUri = workspaceFolders[0].uri;
    }

    const result = await vscode.window.showOpenDialog(options);
    if (result && result.length > 0) {
      return result[0].fsPath;
    }
    return undefined;
  }

  /**
   * Show environment selection dialog
   */
  async selectEnvironments(): Promise<string[] | undefined> {
    const defaultEnv = getEnvironment();
    const items = AVAILABLE_ENVIRONMENTS.map((env) => ({
      label: env.charAt(0).toUpperCase() + env.slice(1),
      description: env,
      picked: env === defaultEnv,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      title: "Select Environments to Sync",
      placeHolder: "Choose which environments to include",
      canPickMany: true,
    });

    if (!selected || selected.length === 0) {
      return undefined;
    }

    return selected.map((s) => s.description);
  }

  /**
   * Show target file name input
   */
  async getTargetFileName(): Promise<string | undefined> {
    const defaultFile = getTargetFile();

    const result = await vscode.window.showInputBox({
      title: "Target Environment File",
      prompt: "Enter the filename for synced variables",
      value: defaultFile,
      placeHolder: ".env.local",
      validateInput: (value) => {
        if (!value) {
          return "Filename is required";
        }
        if (!value.startsWith(".env")) {
          return "File should start with .env (e.g., .env.local, .env.development)";
        }
        if (value.includes("/") || value.includes("\\")) {
          return "Filename cannot contain path separators";
        }
        return undefined;
      },
    });

    return result;
  }

  /**
   * Show conflict resolution dialog
   */
  async resolveConflict(
    conflict: ConflictCheckResult
  ): Promise<ConflictStrategy | undefined> {
    const items: vscode.QuickPickItem[] = [
      {
        label: "$(replace) Overwrite",
        description: "Replace the existing file completely",
        detail:
          "All existing variables will be removed and replaced with synced variables",
      },
      {
        label: "$(copy) Backup & Overwrite",
        description: "Create a backup before replacing",
        detail: `Existing file will be saved as ${conflict.existingFile}.backup-<timestamp>`,
      },
      {
        label: "$(merge) Merge",
        description: "Combine existing and new variables",
        detail:
          "Synced variables will override existing ones with same key; others preserved",
      },
      {
        label: "$(close) Skip",
        description: "Do not sync to this directory",
        detail: "The existing file will remain unchanged",
      },
    ];

    const selected = await vscode.window.showQuickPick(items, {
      title: "Existing .env File Found",
      placeHolder: `${conflict.existingFile} has ${conflict.existingVariableCount} variables`,
    });

    if (!selected) {
      return undefined;
    }

    if (
      selected.label.includes("Overwrite") &&
      !selected.label.includes("Backup")
    ) {
      return "overwrite";
    } else if (selected.label.includes("Backup")) {
      return "backup";
    } else if (selected.label.includes("Merge")) {
      return "merge";
    } else {
      return "skip";
    }
  }

  /**
   * Show full link project workflow
   */
  async showLinkDialog(
    project: Project,
    organization: Organization
  ): Promise<LinkDirectoryOptions | undefined> {
    // Step 1: Select directory
    const directoryPath = await this.selectDirectory();
    if (!directoryPath) {
      return undefined;
    }

    // Step 2: Select environments
    const environments = await this.selectEnvironments();
    if (!environments) {
      return undefined;
    }

    // Step 3: Get target filename
    const targetFile = await this.getTargetFileName();
    if (!targetFile) {
      return undefined;
    }

    // Step 4: Check for conflicts
    const conflict = await this.syncService.checkForConflicts(
      directoryPath,
      targetFile
    );
    let conflictStrategy: ConflictStrategy = "overwrite";

    if (conflict.hasConflict) {
      const strategy = await this.resolveConflict(conflict);
      if (!strategy) {
        return undefined;
      }
      if (strategy === "skip") {
        vscode.window.showInformationMessage("Skipped linking directory");
        return undefined;
      }
      conflictStrategy = strategy;
    }

    // Step 5: Optional display name
    const displayName = await vscode.window.showInputBox({
      title: "Directory Display Name (Optional)",
      prompt: "Enter a friendly name for this directory",
      placeHolder: "e.g., Frontend, Backend, API Server",
    });

    return {
      directoryPath: normalizePath(directoryPath),
      targetFile,
      environments,
      conflictStrategy,
      displayName: displayName || undefined,
    };
  }

  /**
   * Show dialog to add another directory to an existing project
   */
  async showAddDirectoryDialog(
    projectName: string
  ): Promise<LinkDirectoryOptions | undefined> {
    const info = await vscode.window.showInformationMessage(
      `Add another directory to "${projectName}"?`,
      "Select Directory",
      "Cancel"
    );

    if (info !== "Select Directory") {
      return undefined;
    }

    // Reuse the same flow
    const directoryPath = await this.selectDirectory();
    if (!directoryPath) {
      return undefined;
    }

    const environments = await this.selectEnvironments();
    if (!environments) {
      return undefined;
    }

    const targetFile = await this.getTargetFileName();
    if (!targetFile) {
      return undefined;
    }

    const conflict = await this.syncService.checkForConflicts(
      directoryPath,
      targetFile
    );
    let conflictStrategy: ConflictStrategy = "overwrite";

    if (conflict.hasConflict) {
      const strategy = await this.resolveConflict(conflict);
      if (!strategy || strategy === "skip") {
        return undefined;
      }
      conflictStrategy = strategy;
    }

    const displayName = await vscode.window.showInputBox({
      title: "Directory Display Name (Optional)",
      placeHolder: "e.g., Frontend, Backend",
    });

    return {
      directoryPath: normalizePath(directoryPath),
      targetFile,
      environments,
      conflictStrategy,
      displayName: displayName || undefined,
    };
  }

  /**
   * Show quick link dialog (minimal prompts, uses defaults)
   */
  async showQuickLinkDialog(): Promise<LinkDirectoryOptions | undefined> {
    const directoryPath = await this.selectDirectory();
    if (!directoryPath) {
      return undefined;
    }

    const targetFile = getTargetFile();
    const conflict = await this.syncService.checkForConflicts(
      directoryPath,
      targetFile
    );
    let conflictStrategy: ConflictStrategy = "overwrite";

    if (conflict.hasConflict) {
      const strategy = await this.resolveConflict(conflict);
      if (!strategy || strategy === "skip") {
        return undefined;
      }
      conflictStrategy = strategy;
    }

    return {
      directoryPath: normalizePath(directoryPath),
      targetFile,
      environments: [getEnvironment()],
      conflictStrategy,
    };
  }
}
