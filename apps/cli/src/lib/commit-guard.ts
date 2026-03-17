import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  unlinkSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execSync } from "node:child_process";

const HOOK_START_MARKER = "# ENVPILOT_GUARD_START";
const HOOK_END_MARKER = "# ENVPILOT_GUARD_END";

const HOOK_BLOCK = `${HOOK_START_MARKER} - Do not remove. Installed by Envpilot CLI.
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
 * Walk up from startDir looking for a .git directory.
 */
export function findGitRoot(startDir?: string): string | null {
  let dir = startDir || process.cwd();

  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) {
      return null; // reached filesystem root
    }
    dir = parent;
  }
}

/**
 * Resolve the actual .git directory, handling worktrees.
 * In a worktree, .git is a file like: "gitdir: /path/to/real/.git/worktrees/name"
 */
function resolveGitDir(repoRoot: string): string {
  const gitPath = join(repoRoot, ".git");

  try {
    const stat = statSync(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }
  } catch {
    return gitPath;
  }

  // .git is a file — read the gitdir pointer
  try {
    const content = readFileSync(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (match) {
      const gitdir = resolve(repoRoot, match[1]);
      // For worktrees, hooks live in the main repo's hooks dir, not the worktree's
      // The common dir is two levels up from .git/worktrees/<name>
      const commonDir = resolve(gitdir, "..", "..");
      if (existsSync(join(commonDir, "hooks")) || existsSync(commonDir)) {
        return commonDir;
      }
      return gitdir;
    }
  } catch {
    // Fall through
  }

  return gitPath;
}

/**
 * Resolve the hooks directory for a git repo.
 */
function getHooksDir(repoRoot: string): string {
  try {
    const customPath = execSync("git config core.hooksPath", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (customPath) {
      return resolve(repoRoot, customPath);
    }
  } catch {
    // No custom hooks path configured
  }

  const gitDir = resolveGitDir(repoRoot);
  return join(gitDir, "hooks");
}

/**
 * Install the Envpilot pre-commit guard hook.
 */
export function installCommitGuard(repoRoot?: string): {
  installed: boolean;
  hookPath: string | null;
  message: string;
} {
  const root = repoRoot || findGitRoot();
  if (!root) {
    return {
      installed: false,
      hookPath: null,
      message: "Not a git repository",
    };
  }

  try {
    const hooksDir = getHooksDir(root);
    const hookPath = join(hooksDir, "pre-commit");

    // Ensure hooks directory exists
    mkdirSync(hooksDir, { recursive: true });

    let existingContent = "";
    try {
      existingContent = readFileSync(hookPath, "utf-8");
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
      writeFileSync(hookPath, updated, "utf-8");
      chmodSync(hookPath, 0o755);
      return {
        installed: true,
        hookPath,
        message: "Pre-commit hook updated",
      };
    }

    // Install new hook
    let newContent: string;
    if (existingContent.trim()) {
      // Append to existing hook
      newContent = existingContent.trimEnd() + "\n\n" + HOOK_BLOCK + "\n";
    } else {
      // Create new hook
      newContent = "#!/bin/sh\n\n" + HOOK_BLOCK + "\n";
    }

    writeFileSync(hookPath, newContent, "utf-8");
    chmodSync(hookPath, 0o755);

    return {
      installed: true,
      hookPath,
      message: "Pre-commit hook installed",
    };
  } catch (err) {
    return {
      installed: false,
      hookPath: null,
      message: `Failed to install hook: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Remove the Envpilot guard block from the pre-commit hook.
 */
export function removeCommitGuard(repoRoot?: string): boolean {
  const root = repoRoot || findGitRoot();
  if (!root) return false;

  try {
    const hooksDir = getHooksDir(root);
    const hookPath = join(hooksDir, "pre-commit");

    let content: string;
    try {
      content = readFileSync(hookPath, "utf-8");
    } catch {
      return false; // No hook file
    }

    if (!content.includes(HOOK_START_MARKER)) {
      return false; // Guard not installed
    }

    const startIdx = content.indexOf(HOOK_START_MARKER);
    const endIdx =
      content.indexOf(HOOK_END_MARKER) + HOOK_END_MARKER.length;

    let cleaned =
      content.substring(0, startIdx) + content.substring(endIdx);
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

    if (cleaned === "#!/bin/sh" || cleaned === "") {
      unlinkSync(hookPath);
    } else {
      writeFileSync(hookPath, cleaned + "\n", "utf-8");
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the Envpilot commit guard is installed.
 */
export function isCommitGuardInstalled(repoRoot?: string): boolean {
  const root = repoRoot || findGitRoot();
  if (!root) return false;

  try {
    const hooksDir = getHooksDir(root);
    const hookPath = join(hooksDir, "pre-commit");
    const content = readFileSync(hookPath, "utf-8");
    return content.includes(HOOK_START_MARKER);
  } catch {
    return false;
  }
}
