import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import type { GitExtension, API, Repository } from "../types/git";
import * as output from "../utils/outputChannel";
import { captureError } from "../utils/sentry";
import { shouldAutoInstallHook } from "../utils/config";
import { isPathInside } from "../utils/paths";

const execFileAsync = promisify(execFile);

const ENV_NAME = /^\.env($|\.)/;
const ENV_TEMPLATE_NAME = /\.env\.(example|sample|template|dist)$/;
const INDEX_DELETED = 2;
const SHELL_SHEBANG = /^#!\s*\S*\/(?:env\s+)?(?:ba)?sh(?:\s|$)/;
const TOP_LEVEL_EXIT = /^exit\b/m;

const HOOK_START_MARKER = "# ENVPILOT_GUARD_START";
const HOOK_END_MARKER = "# ENVPILOT_GUARD_END";

const HOOK_BLOCK = `${HOOK_START_MARKER} - Do not remove. Installed by Envpilot VS Code extension.
ENV_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '(^|/)\\.env($|\\.)' | grep -vE '\\.env\\.(example|sample|template|dist)$' || true)
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

export function isGuardedEnvFile(fsPath: string): boolean {
  const name = path.basename(fsPath);
  return ENV_NAME.test(name) && !ENV_TEMPLATE_NAME.test(name);
}

function findGuardBlock(
  content: string
): { before: string; after: string } | "none" | "unterminated" {
  const start = content.indexOf(HOOK_START_MARKER);
  if (start === -1) return "none";
  const end = content.indexOf(HOOK_END_MARKER, start);
  if (end === -1) return "unterminated";
  return {
    before: content.slice(0, start),
    after: content.slice(end + HOOK_END_MARKER.length),
  };
}

export class GitCommitGuardService {
  private disposables: vscode.Disposable[] = [];
  private gitApi: API | null = null;
  private initialized: Promise<void> | null = null;
  private repoWatchers: Map<Repository, vscode.Disposable> = new Map();
  private lastWarningTime = 0;
  private static readonly WARNING_DEBOUNCE_MS = 5000;

  constructor(private linkedDirectories: () => string[]) {}

  initialize(): Promise<void> {
    this.initialized ??= this.initializeGitApi();
    return this.initialized;
  }

  async installHooks(): Promise<number> {
    let installed = 0;
    for (const root of this.repoRoots()) {
      if (await this.installHookIfLinked(root)) installed++;
    }
    return installed;
  }

  async removeHooks(): Promise<number> {
    let removed = 0;
    for (const root of this.repoRoots()) {
      if (await this.removeHookAtPath(root)) removed++;
    }
    return removed;
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

      for (const repo of this.gitApi.repositories) {
        this.watchRepository(repo);
      }

      this.disposables.push(
        this.gitApi.onDidOpenRepository((repo) => {
          this.watchRepository(repo);
          if (shouldAutoInstallHook()) {
            void this.installHookIfLinked(repo.rootUri.fsPath);
          }
        }),
        this.gitApi.onDidCloseRepository((repo) => {
          this.unwatchRepository(repo);
        })
      );

      output.log(
        `Git commit guard active. Watching ${this.gitApi.repositories.length} repository(ies).`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Git model not found")) {
        captureError(err, { phase: "commit-guard-init" });
      }
      output.error(`Failed to initialize Git API: ${message}`);
    }
  }

  private repoRoots(): string[] {
    if (this.gitApi) {
      return this.gitApi.repositories.map((repo) => repo.rootUri.fsPath);
    }
    return (vscode.workspace.workspaceFolders ?? []).map(
      (folder) => folder.uri.fsPath
    );
  }

  private watchRepository(repo: Repository): void {
    if (this.repoWatchers.has(repo)) {
      return;
    }
    const disposable = repo.state.onDidChange(() => {
      void this.checkAndUnstageEnvFiles(repo).catch(captureError);
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
    const envFiles = repo.state.indexChanges.filter(
      (change) =>
        change.status !== INDEX_DELETED && isGuardedEnvFile(change.uri.fsPath)
    );

    if (envFiles.length === 0) {
      return;
    }

    for (const change of envFiles) {
      try {
        await vscode.commands.executeCommand("git.unstage", change.uri);
      } catch (err) {
        output.error(
          `Failed to unstage ${change.uri.fsPath}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

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

  private async hookPath(
    repoRoot: string
  ): Promise<{ path: string; insideGit: boolean } | null> {
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync(
        "git",
        ["rev-parse", "--git-common-dir", "--git-path", "hooks"],
        { cwd: repoRoot }
      ));
    } catch {
      return null;
    }
    const [gitDir, hooksDir] = stdout
      .trim()
      .split("\n")
      .map((line) => path.resolve(repoRoot, line.trim()));
    if (!gitDir || !hooksDir) return null;
    return {
      path: path.join(hooksDir, "pre-commit"),
      insideGit: isPathInside(hooksDir, gitDir),
    };
  }

  private async installHookIfLinked(repoRoot: string): Promise<boolean> {
    if (!this.linkedDirectories().some((dir) => isPathInside(dir, repoRoot))) {
      return false;
    }
    try {
      const hook = await this.hookPath(repoRoot);
      if (!hook) return false;
      if (!hook.insideGit) {
        output.warn(
          `Commit guard hook skipped for ${repoRoot}: core.hooksPath points outside .git.`
        );
        return false;
      }
      const hookPath = hook.path;

      const existing = await fs.readFile(hookPath, "utf-8").catch(() => "");
      const firstLine = existing.split("\n", 1)[0];
      if (firstLine.startsWith("#!") && !SHELL_SHEBANG.test(firstLine)) {
        output.warn(
          `Commit guard hook skipped: ${hookPath} is not a sh/bash script.`
        );
        return false;
      }

      const block = findGuardBlock(existing);
      if (block === "unterminated") {
        output.warn(
          `Commit guard hook skipped: ${hookPath} has a start marker with no end marker.`
        );
        return false;
      }

      const shebang = firstLine.startsWith("#!") ? `${firstLine}\n` : "";
      const next =
        block !== "none"
          ? block.before + HOOK_BLOCK + block.after
          : !existing.trim()
            ? `#!/bin/sh\n\n${HOOK_BLOCK}\n`
            : TOP_LEVEL_EXIT.test(existing)
              ? `${shebang}${HOOK_BLOCK}\n${existing.slice(shebang.length)}`
              : `${existing.trimEnd()}\n\n${HOOK_BLOCK}\n`;

      if (next !== existing) {
        await fs.mkdir(path.dirname(hookPath), { recursive: true });
        await fs.writeFile(hookPath, next, "utf-8");
        output.log(`Installed commit guard hook at ${hookPath}`);
      }
      await fs.chmod(hookPath, 0o755);
      return true;
    } catch (err) {
      captureError(err, { phase: "commit-guard-hook-install" });
      output.error(
        `Failed to install pre-commit hook at ${repoRoot}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  private async removeHookAtPath(repoRoot: string): Promise<boolean> {
    try {
      const hookPath = (await this.hookPath(repoRoot))?.path;
      if (!hookPath) return false;

      const content = await fs.readFile(hookPath, "utf-8").catch(() => "");
      const block = findGuardBlock(content);
      if (block === "none") return false;
      if (block === "unterminated") {
        output.warn(
          `Commit guard block in ${hookPath} has no end marker; remove it by hand.`
        );
        return false;
      }

      const cleaned = (block.before + block.after)
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (cleaned === "#!/bin/sh" || cleaned === "") {
        await fs.unlink(hookPath);
      } else {
        await fs.writeFile(hookPath, `${cleaned}\n`, "utf-8");
      }
      output.log(`Removed commit guard from ${hookPath}`);
      return true;
    } catch (err) {
      output.error(
        `Failed to remove hook in ${repoRoot}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
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
  }
}
