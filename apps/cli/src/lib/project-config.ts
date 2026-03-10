import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  projectConfigSchema,
  type ProjectConfig,
  type Environment,
} from "../types/index.js";

// Project config file name
const CONFIG_FILE_NAME = ".envpilot";

/**
 * Get the path to the project config file
 */
export function getProjectConfigPath(
  directory: string = process.cwd()
): string {
  return join(directory, CONFIG_FILE_NAME);
}

/**
 * Check if a project config file exists
 */
export function hasProjectConfig(directory: string = process.cwd()): boolean {
  return existsSync(getProjectConfigPath(directory));
}

/**
 * Read the project config file
 */
export function readProjectConfig(
  directory: string = process.cwd()
): ProjectConfig | null {
  const configPath = getProjectConfigPath(directory);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(content);
    return projectConfigSchema.parse(parsed);
  } catch {
    return null;
  }
}

/**
 * Write the project config file
 */
export function writeProjectConfig(
  config: ProjectConfig,
  directory: string = process.cwd()
): void {
  const configPath = getProjectConfigPath(directory);
  const content = JSON.stringify(config, null, 2) + "\n";
  writeFileSync(configPath, content, "utf-8");
}

/**
 * Update the project config file
 */
export function updateProjectConfig(
  updates: Partial<ProjectConfig>,
  directory: string = process.cwd()
): void {
  const existing = readProjectConfig(directory);

  if (!existing) {
    throw new Error("No project config found. Run `envpilot init` first.");
  }

  const updated = { ...existing, ...updates };
  writeProjectConfig(updated, directory);
}

/**
 * Get the current environment from project config
 */
export function getCurrentEnvironment(
  directory: string = process.cwd()
): Environment {
  const config = readProjectConfig(directory);
  return config?.environment ?? "development";
}

/**
 * Set the current environment in project config
 */
export function setCurrentEnvironment(
  environment: Environment,
  directory: string = process.cwd()
): void {
  updateProjectConfig({ environment }, directory);
}

/**
 * Delete the project config file
 */
export function deleteProjectConfig(
  directory: string = process.cwd()
): boolean {
  const configPath = getProjectConfigPath(directory);

  if (!existsSync(configPath)) {
    return false;
  }

  unlinkSync(configPath);
  return true;
}

/**
 * Add .envpilot to .gitignore if it exists
 */
export function addToGitignore(directory: string = process.cwd()): void {
  const gitignorePath = join(directory, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");

  // Check if already in .gitignore
  if (lines.some((line) => line.trim() === ".envpilot")) {
    return;
  }

  // Add to .gitignore
  const newContent = content.endsWith("\n")
    ? content + ".envpilot\n"
    : content + "\n.envpilot\n";

  writeFileSync(gitignorePath, newContent, "utf-8");
}

/**
 * Ensure .env is in .gitignore
 */
export function ensureEnvInGitignore(directory: string = process.cwd()): void {
  const gitignorePath = join(directory, ".gitignore");

  if (!existsSync(gitignorePath)) {
    // Create .gitignore with .env
    writeFileSync(gitignorePath, ".env\n.env.local\n", "utf-8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");

  // Check if .env is already in .gitignore
  if (lines.some((line) => line.trim() === ".env")) {
    return;
  }

  // Add .env to .gitignore
  const newContent = content.endsWith("\n")
    ? content + ".env\n"
    : content + "\n.env\n";

  writeFileSync(gitignorePath, newContent, "utf-8");
}

/**
 * Check if any .env files are tracked by git.
 * Returns a list of tracked .env file paths, or an empty array if none.
 */
export function getTrackedEnvFiles(
  directory: string = process.cwd()
): string[] {
  try {
    const result = execSync("git ls-files --cached .env .env.* .env.local", {
      cwd: directory,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    return result
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    // Not a git repo or git not available — skip check
    return [];
  }
}

/**
 * Check if inside a git repository.
 */
export function isGitRepo(directory: string = process.cwd()): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", {
      cwd: directory,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}
