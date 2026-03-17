import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import {
  projectConfigSchema,
  projectConfigV2Schema,
  type ProjectConfig,
  type ProjectConfigV2,
  type ProjectEntry,
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

// ── V2 Read / Write ──────────────────────────────────────────────────

function readRawConfig(directory: string = process.cwd()): unknown | null {
  const configPath = getProjectConfigPath(directory);
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

function migrateV1toV2(v1: ProjectConfig): ProjectConfigV2 {
  return {
    version: 1 as const,
    activeProjectId: v1.projectId,
    projects: [
      {
        projectId: v1.projectId,
        organizationId: v1.organizationId,
        projectName: "",
        organizationName: "",
        environment: v1.environment,
      },
    ],
  };
}

/**
 * Read multi-project config. Auto-migrates V1 → V2 on disk.
 */
export function readProjectConfigV2(
  directory: string = process.cwd()
): ProjectConfigV2 | null {
  const raw = readRawConfig(directory);
  if (!raw || typeof raw !== "object") return null;

  // Already V2
  const rawVersion = (raw as Record<string, unknown>).version;
  if (rawVersion === 1 || rawVersion === 2) {
    try {
      // Normalize old version: 2 files to version: 1
      const normalized = { ...(raw as Record<string, unknown>), version: 1 };
      const parsed = projectConfigV2Schema.parse(normalized);
      // Rewrite to disk if version was old format
      if (rawVersion === 2) {
        writeProjectConfigV2(parsed, directory);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  // V1 → migrate
  try {
    const v1 = projectConfigSchema.parse(raw);
    const v2 = migrateV1toV2(v1);
    writeProjectConfigV2(v2, directory);
    return v2;
  } catch {
    return null;
  }
}

/**
 * Write multi-project config to disk
 */
export function writeProjectConfigV2(
  config: ProjectConfigV2,
  directory: string = process.cwd()
): void {
  const configPath = getProjectConfigPath(directory);
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ── V2 Helpers ───────────────────────────────────────────────────────

export function getActiveProject(config: ProjectConfigV2): ProjectEntry | null {
  return (
    config.projects.find((p) => p.projectId === config.activeProjectId) ||
    config.projects[0] ||
    null
  );
}

export function resolveProject(
  config: ProjectConfigV2,
  identifier?: string
): ProjectEntry | null {
  if (!identifier) return getActiveProject(config);
  return (
    config.projects.find(
      (p) =>
        p.projectId === identifier ||
        p.projectName.toLowerCase() === identifier.toLowerCase()
    ) || null
  );
}

export function addProjectToConfig(
  config: ProjectConfigV2,
  entry: ProjectEntry
): ProjectConfigV2 {
  if (config.projects.some((p) => p.projectId === entry.projectId)) {
    throw new Error("Project already linked");
  }
  return { ...config, projects: [...config.projects, entry] };
}

export function removeProjectFromConfig(
  config: ProjectConfigV2,
  projectId: string
): ProjectConfigV2 | null {
  const filtered = config.projects.filter((p) => p.projectId !== projectId);
  if (filtered.length === 0) return null;
  const activeId =
    config.activeProjectId === projectId
      ? filtered[0].projectId
      : config.activeProjectId;
  return { ...config, activeProjectId: activeId, projects: filtered };
}

export function setActiveProjectInConfig(
  config: ProjectConfigV2,
  projectId: string
): ProjectConfigV2 {
  if (!config.projects.some((p) => p.projectId === projectId)) {
    throw new Error("Project not found in config");
  }
  return { ...config, activeProjectId: projectId };
}

export function updateProjectInConfig(
  config: ProjectConfigV2,
  projectId: string,
  updates: Partial<ProjectEntry>
): ProjectConfigV2 {
  return {
    ...config,
    projects: config.projects.map((p) =>
      p.projectId === projectId ? { ...p, ...updates } : p
    ),
  };
}

// ── V1 Compat (delegates to V2 internally) ───────────────────────────

/**
 * Read the project config file (returns active project as V1 shape)
 */
export function readProjectConfig(
  directory: string = process.cwd()
): ProjectConfig | null {
  const v2 = readProjectConfigV2(directory);
  if (!v2) return null;
  const active = getActiveProject(v2);
  if (!active) return null;
  return {
    projectId: active.projectId,
    organizationId: active.organizationId,
    environment: active.environment,
  };
}

/**
 * Write the project config file (V1 compat — wraps as V2)
 */
export function writeProjectConfig(
  config: ProjectConfig,
  directory: string = process.cwd()
): void {
  const existing = readProjectConfigV2(directory);
  if (existing) {
    // Update/replace the active project entry
    const updated = updateProjectInConfig(existing, existing.activeProjectId, {
      projectId: config.projectId,
      organizationId: config.organizationId,
      environment: config.environment,
    });
    // Also update activeProjectId in case it changed
    writeProjectConfigV2(
      { ...updated, activeProjectId: config.projectId },
      directory
    );
  } else {
    // Fresh write
    writeProjectConfigV2(
      {
        version: 1 as const,
        activeProjectId: config.projectId,
        projects: [
          {
            projectId: config.projectId,
            organizationId: config.organizationId,
            projectName: "",
            organizationName: "",
            environment: config.environment,
          },
        ],
      },
      directory
    );
  }
}

/**
 * Update the project config file (updates active project's fields)
 */
export function updateProjectConfig(
  updates: Partial<ProjectConfig>,
  directory: string = process.cwd()
): void {
  const v2 = readProjectConfigV2(directory);
  if (!v2) {
    throw new Error("No project config found. Run `envpilot init` first.");
  }
  const active = getActiveProject(v2);
  if (!active) {
    throw new Error("No active project found.");
  }
  const updated = updateProjectInConfig(v2, active.projectId, updates);
  writeProjectConfigV2(updated, directory);
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
  if (!existsSync(configPath)) return false;
  unlinkSync(configPath);
  return true;
}

// ── Git Helpers (unchanged) ──────────────────────────────────────────

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

  if (lines.some((line) => line.trim() === ".envpilot")) {
    return;
  }

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
    writeFileSync(gitignorePath, ".env\n.env.local\n", "utf-8");
    return;
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const lines = content.split("\n");

  if (lines.some((line) => line.trim() === ".env")) {
    return;
  }

  const newContent = content.endsWith("\n")
    ? content + ".env\n"
    : content + "\n.env\n";

  writeFileSync(gitignorePath, newContent, "utf-8");
}

/**
 * Check if any .env files are tracked by git.
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
