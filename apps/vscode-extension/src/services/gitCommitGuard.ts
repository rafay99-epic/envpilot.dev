import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import type { GitExtension, API, Repository } from "../types/git";
import * as output from "../utils/outputChannel";
import { captureError } from "../utils/sentry";

const execAsync = promisify(exec);

const ENV_PATTERN = /(^|\/)\.env($|\.)/;

const HOOK_START_MARKER = "# ENVPILOT_GUARD_START";
const HOOK_END_MARKER = "# ENVPILOT_GUARD_END";

const HOOK_BLOCK = `${HOOK_START_MARKER} - Do not remove. Installed by Envpilot VS Code extension.
ENV_FILES=$(git diff --cached --name-only | grep -E '(^|/)\\.env($|\\.)' || true)
if [ -n "$ENV_FILES" ]; then
  echo ""
  echo "\\033[1;31mERROR:\\033[0m Envpilot commit guard blocked this commit."
  echo ""
  echo "The following .env files were staged:"
  echo "$ENV_FILES" | while IFS= read -r f; do echo "  - $f"; done
  echo ""
  echo "Remove them with: git reset HEAD <file>"
  echo "To bypass (not recommended): git commit --no-verify"
  exit 1
fi
${HOOK_END_MARKER}`;

/**
 * GitCommitGuardService provides dual-layer protection against committing .env files:
 * 1. VS Code Git Extension API: auto-unstages .env files in real-time
 * 2. Pre-commit hook: blocks .env commits from any git client
 */
export class GitCommitGuardService {
  private disposables: vscode.Disposable[] = [];
  private gitApi: API | null = null;
  private installedHookPaths: Set<string> = new Set();
  /** Per-repo `state.onDidChange` subscriptions, torn down when a repo closes. */
  private repoWatchers: Map<Repository, vscode.Disposable> = new Map();
  private lastWarningTime = 0;
  private static readonly WARNING_DEBOUNCE_MS = 5000;

  async initialize(): Promise<void> {
    await this.initializeGitApi();
    await this.installPreCommitHooks();
  }

  private async initializeGitApi(): Promise<void> {
    try {
      const gitExtension =
        vscode.extensions.getExtension<GitExtension>("vscode.git");

      if (!gitExtension) {
        output.warn(
          "Git extension not found. Staging guard disabled, pre-commit hook still active."
        );
        return;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitApi = gitExtension.exports.getAPI(1);

      // Watch existing repositories
      for (const repo of this.gitApi.repositories) {
        this.watchRepository(repo);
      }

      // Watch for new repositories
      this.disposables.push(
        this.gitApi.onDidOpenRepository((repo) => {
          this.watchRepository(repo);
          this.installHookForRepo(repo);
        })
      );

      // Tear down the per-repo listener when a repo closes (e.g. a folder
      // is removed from a multi-root workspace) so it doesn't leak forever.
      this.disposables.push(
        this.gitApi.onDidCloseRepository((repo) => {
          this.unwatchRepository(repo);
        })
      );

      output.log(
        `Git commit guard active. Watching ${this.gitApi.repositories.length} repository(ies).`
      );
    } catch (err) {
      captureError(err, { phase: "commit-guard-init" });
      output.error(
        `Failed to initialize Git API: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private watchRepository(repo: Repository): void {
    // Avoid double-subscribing if a repo is reported as opened more than once.
    if (this.repoWatchers.has(repo)) {
      return;
    }
    const disposable = repo.state.onDidChange(() => {
      this.checkAndUnstageEnvFiles(repo);
    });
    this.repoWatchers.set(repo, disposable);
  }

  private unwatchRepository(repo: Repository): void {
    const disposable = this.repoWatchers.get(repo);
    if (disposable) {
      disposable.dispose();
      this.repoWatchers.delete(repo);
    }
  }

  private async checkAndUnstageEnvFiles(repo: Repository): Promise<void> {
    const envFiles = repo.state.indexChanges.filter((change) =>
      ENV_PATTERN.test(change.uri.fsPath)
    );

    if (envFiles.length === 0) {
      return;
    }

    // Unstage each .env file
    for (const change of envFiles) {
      try {
        await vscode.commands.executeCommand("git.unstage", change.uri);
      } catch (err) {
        output.error(
          `Failed to unstage ${change.uri.fsPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Debounced warning notification
    const now = Date.now();
    if (
      now - this.lastWarningTime >
      GitCommitGuardService.WARNING_DEBOUNCE_MS
    ) {
      this.lastWarningTime = now;
      const fileNames = envFiles
        .map((f) => path.basename(f.uri.fsPath))
        .join(", ");

      const action = await vscode.window.showWarningMessage(
        `Envpilot blocked staging of: ${fileNames}. These files contain secrets and must not be committed.`,
        "Learn More"
      );

      if (action === "Learn More") {
        output.show();
      }
    }
  }

  private async installPreCommitHooks(): Promise<void> {
    if (!this.gitApi) {
      // Try to find git repos from workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) return;

      for (const folder of workspaceFolders) {
        await this.installHookAtPath(folder.uri.fsPath);
      }
      return;
    }

    for (const repo of this.gitApi.repositories) {
      await this.installHookForRepo(repo);
    }
  }

  private async installHookForRepo(repo: Repository): Promise<void> {
    await this.installHookAtPath(repo.rootUri.fsPath);
  }

  private async installHookAtPath(repoRoot: string): Promise<void> {
    try {
      // Check for custom hooks path
      let hooksDir: string;
      try {
        const { stdout } = await execAsync("git config core.hooksPath", {
          cwd: repoRoot,
        });
        const customPath = stdout.trim();
        hooksDir = customPath
          ? path.resolve(repoRoot, customPath)
          : path.join(repoRoot, ".git", "hooks");
      } catch {
        hooksDir = path.join(repoRoot, ".git", "hooks");
      }

      // Verify .git directory exists
      try {
        await fs.access(path.join(repoRoot, ".git"));
      } catch {
        return; // Not a git repo
      }

      const hookPath = path.join(hooksDir, "pre-commit");

      // Ensure hooks directory exists
      await fs.mkdir(hooksDir, { recursive: true });

      let existingContent = "";
      try {
        existingContent = await fs.readFile(hookPath, "utf-8");
      } catch {
        // File doesn't exist
      }

      // Check if our guard is already installed
      if (existingContent.includes(HOOK_START_MARKER)) {
        // Update existing guard block
        const startIdx = existingContent.indexOf(HOOK_START_MARKER);
        const endIdx =
          existingContent.indexOf(HOOK_END_MARKER) + HOOK_END_MARKER.length;
        const updated =
          existingContent.substring(0, startIdx) +
          HOOK_BLOCK +
          existingContent.substring(endIdx);
        await fs.writeFile(hookPath, updated, "utf-8");
        await fs.chmod(hookPath, 0o755);
        this.installedHookPaths.add(hookPath);
        output.log(`Updated commit guard hook at ${hookPath}`);
        return;
      }

      // Install new hook
      let newContent: string;
      if (existingContent.trim()) {
        // Append to existing hook
        newContent = existingContent.trimEnd() + "\n\n" + HOOK_BLOCK + "\n";
        output.log(`Appended commit guard to existing hook at ${hookPath}`);
      } else {
        // Create new hook
        newContent = "#!/bin/sh\n\n" + HOOK_BLOCK + "\n";
        output.log(`Created commit guard hook at ${hookPath}`);
      }

      await fs.writeFile(hookPath, newContent, "utf-8");
      await fs.chmod(hookPath, 0o755);
      this.installedHookPaths.add(hookPath);
    } catch (err) {
      captureError(err, { phase: "commit-guard-hook-install" });
      output.error(
        `Failed to install pre-commit hook at ${repoRoot}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async removeHooks(): Promise<void> {
    for (const hookPath of this.installedHookPaths) {
      try {
        const content = await fs.readFile(hookPath, "utf-8");
        if (!content.includes(HOOK_START_MARKER)) continue;

        const startIdx = content.indexOf(HOOK_START_MARKER);
        const endIdx =
          content.indexOf(HOOK_END_MARKER) + HOOK_END_MARKER.length;

        let cleaned =
          content.substring(0, startIdx) + content.substring(endIdx);
        cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

        // If only shebang remains, delete the file
        if (cleaned === "#!/bin/sh" || cleaned === "") {
          await fs.unlink(hookPath);
          output.log(`Removed commit guard hook at ${hookPath}`);
        } else {
          await fs.writeFile(hookPath, cleaned + "\n", "utf-8");
          output.log(`Removed commit guard block from ${hookPath}`);
        }
      } catch (err) {
        output.error(
          `Failed to remove hook at ${hookPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    this.installedHookPaths.clear();
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
    for (const disposable of this.repoWatchers.values()) {
      disposable.dispose();
    }
    this.repoWatchers.clear();
    // Hooks persist intentionally — they protect even without the extension
  }
}
