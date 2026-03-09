import * as vscode from "vscode";
import type {
  AuthSession,
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
} from "../types";
import { normalizePath } from "./paths";

const AUTH_SESSION_KEY = "envConnect.authSession";
const LINKED_PROJECTS_KEY = "envConnect.linkedProjects";
const LINKED_PROJECTS_V2_KEY = "envConnect.linkedProjectsV2";
const ACCESS_TOKEN_PREFIX = "envConnect.token.";
const PROJECT_TOKEN_PREFIX = "envConnect.projectToken.";
const STORAGE_VERSION_KEY = "envConnect.storageVersion";
const CURRENT_STORAGE_VERSION = 2;

/**
 * Linked project metadata (without access token) - V1 format
 */
interface LinkedProjectMetadata {
  projectId: string;
  projectName: string;
  organizationName: string;
  expiresAt: number;
  environment: string;
  targetFile: string;
  lastSyncedAt: number | null;
  workspacePath: string;
}

/**
 * Linked project metadata (without access token) - V2 format
 */
interface LinkedProjectMetadataV2 {
  projectId: string;
  projectName: string;
  organizationName: string;
  expiresAt: number;
  directories: LinkedDirectory[];
  defaultEnvironment: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Storage service for persisting extension state securely
 * Access tokens are stored in VS Code's secret storage for security
 */
export class StorageService {
  private context: vscode.ExtensionContext;
  private migrationComplete = false;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get the extension context (for device info)
   */
  getContext(): vscode.ExtensionContext {
    return this.context;
  }

  /**
   * Migrate storage from V1 to V2 format if needed
   */
  async migrateIfNeeded(): Promise<void> {
    if (this.migrationComplete) {
      return;
    }

    const currentVersion =
      this.context.globalState.get<number>(STORAGE_VERSION_KEY) || 1;

    if (currentVersion < CURRENT_STORAGE_VERSION) {
      if (currentVersion === 1) {
        await this.migrateV1ToV2();
      }
      await this.context.globalState.update(
        STORAGE_VERSION_KEY,
        CURRENT_STORAGE_VERSION,
      );
    }

    this.migrationComplete = true;
  }

  /**
   * Migrate from V1 (single workspace per project) to V2 (multiple directories)
   */
  private async migrateV1ToV2(): Promise<void> {
    const oldProjects = this.getLinkedProjectsMetadata(); // V1 format
    const newProjects: LinkedProjectMetadataV2[] = [];

    for (const old of oldProjects) {
      const directory: LinkedDirectory = {
        directoryPath: normalizePath(old.workspacePath),
        targetFile: old.targetFile,
        environments: [old.environment],
        lastSyncedAt: old.lastSyncedAt,
        createdAt: Date.now(),
      };

      // Check if project already exists in new format
      const existingIndex = newProjects.findIndex(
        (p) => p.projectId === old.projectId,
      );
      if (existingIndex !== -1) {
        newProjects[existingIndex] = {
          ...newProjects[existingIndex],
          directories: [...newProjects[existingIndex].directories, directory],
          updatedAt: Date.now(),
        };
      } else {
        // Get the old access token and migrate it to new format
        const oldToken = await this.getAccessToken(
          old.projectId,
          old.workspacePath,
        );
        if (oldToken) {
          await this.setAccessTokenForProject(old.projectId, oldToken);
        }

        newProjects.push({
          projectId: old.projectId,
          projectName: old.projectName,
          organizationName: old.organizationName,
          expiresAt: old.expiresAt,
          directories: [directory],
          defaultEnvironment: old.environment,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    await this.context.globalState.update(LINKED_PROJECTS_V2_KEY, newProjects);
  }

  // Auth Session Management
  async getAuthSession(): Promise<AuthSession | null> {
    const session = await this.context.secrets.get(AUTH_SESSION_KEY);
    if (!session) {
      return null;
    }

    try {
      const parsed = JSON.parse(session) as AuthSession;

      // Check if session is expired
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        await this.clearAuthSession();
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  async setAuthSession(session: AuthSession): Promise<void> {
    await this.context.secrets.store(AUTH_SESSION_KEY, JSON.stringify(session));
  }

  async clearAuthSession(): Promise<void> {
    await this.context.secrets.delete(AUTH_SESSION_KEY);
  }

  // ============================================
  // V1 Legacy Methods (kept for migration)
  // ============================================

  /**
   * Get linked projects metadata - V1 format (legacy)
   */
  getLinkedProjectsMetadata(): LinkedProjectMetadata[] {
    const projects =
      this.context.globalState.get<LinkedProjectMetadata[]>(
        LINKED_PROJECTS_KEY,
      );
    return projects || [];
  }

  async setLinkedProjectsMetadata(
    projects: LinkedProjectMetadata[],
  ): Promise<void> {
    await this.context.globalState.update(LINKED_PROJECTS_KEY, projects);
  }

  /**
   * Get access token for a project from secret storage - V1 format
   */
  async getAccessToken(
    projectId: string,
    workspacePath: string,
  ): Promise<string | null> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    return (await this.context.secrets.get(key)) || null;
  }

  /**
   * Store access token in secret storage - V1 format
   */
  async setAccessToken(
    projectId: string,
    workspacePath: string,
    token: string,
  ): Promise<void> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    await this.context.secrets.store(key, token);
  }

  /**
   * Delete access token from secret storage - V1 format
   */
  async deleteAccessToken(
    projectId: string,
    workspacePath: string,
  ): Promise<void> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    await this.context.secrets.delete(key);
  }

  /**
   * Get all linked projects with their access tokens - V1 format (legacy)
   */
  async getLinkedProjects(): Promise<LinkedProject[]> {
    const metadata = this.getLinkedProjectsMetadata();

    const projects = await Promise.all(
      metadata.map(async (m) => {
        const accessToken = await this.getAccessToken(
          m.projectId,
          m.workspacePath,
        );
        return {
          ...m,
          accessToken: accessToken || "",
        };
      }),
    );

    // Filter out projects where token retrieval failed
    return projects.filter((p) => p.accessToken);
  }

  /**
   * Get linked projects metadata (synchronous, for quick checks) - V1 format
   */
  getLinkedProjectsSync(): LinkedProjectMetadata[] {
    return this.getLinkedProjectsMetadata();
  }

  async addLinkedProject(project: LinkedProject): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();

    // Remove existing link for same project/workspace combo
    const filtered = metadata.filter(
      (p) =>
        !(
          p.projectId === project.projectId &&
          p.workspacePath === project.workspacePath
        ),
    );

    // Store access token separately in secrets
    await this.setAccessToken(
      project.projectId,
      project.workspacePath,
      project.accessToken,
    );

    // Store metadata without access token
    const { accessToken, ...metadataOnly } = project;
    filtered.push(metadataOnly);
    await this.setLinkedProjectsMetadata(filtered);
  }

  async removeLinkedProject(
    projectId: string,
    workspacePath: string,
  ): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();
    const filtered = metadata.filter(
      (p) => !(p.projectId === projectId && p.workspacePath === workspacePath),
    );

    // Delete the access token
    await this.deleteAccessToken(projectId, workspacePath);

    await this.setLinkedProjectsMetadata(filtered);
  }

  async getLinkedProjectForWorkspace(
    workspacePath: string,
  ): Promise<LinkedProject | null> {
    const metadata = this.getLinkedProjectsMetadata();
    const match = metadata.find((p) => p.workspacePath === workspacePath);

    if (!match) {
      return null;
    }

    const accessToken = await this.getAccessToken(
      match.projectId,
      match.workspacePath,
    );
    if (!accessToken) {
      return null;
    }

    return { ...match, accessToken };
  }

  async updateLinkedProject(
    projectId: string,
    workspacePath: string,
    updates: Partial<LinkedProject>,
  ): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();
    const index = metadata.findIndex(
      (p) => p.projectId === projectId && p.workspacePath === workspacePath,
    );

    if (index !== -1) {
      // If access token is being updated, store it separately
      if (updates.accessToken) {
        await this.setAccessToken(
          projectId,
          workspacePath,
          updates.accessToken,
        );
      }

      // Update metadata (excluding accessToken)
      const { accessToken, ...metadataUpdates } = updates;
      metadata[index] = { ...metadata[index], ...metadataUpdates };
      await this.setLinkedProjectsMetadata(metadata);
    }
  }

  // ============================================
  // V2 Methods (multi-directory support)
  // ============================================

  /**
   * Get access token for a project - V2 format (shared across directories)
   */
  async getAccessTokenForProject(projectId: string): Promise<string | null> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    return (await this.context.secrets.get(key)) || null;
  }

  /**
   * Store access token for a project - V2 format
   */
  async setAccessTokenForProject(
    projectId: string,
    token: string,
  ): Promise<void> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    await this.context.secrets.store(key, token);
  }

  /**
   * Delete access token for a project - V2 format
   */
  async deleteAccessTokenForProject(projectId: string): Promise<void> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    await this.context.secrets.delete(key);
  }

  /**
   * Get linked projects metadata - V2 format
   */
  getLinkedProjectsMetadataV2(): LinkedProjectMetadataV2[] {
    return (
      this.context.globalState.get<LinkedProjectMetadataV2[]>(
        LINKED_PROJECTS_V2_KEY,
      ) || []
    );
  }

  /**
   * Set linked projects metadata - V2 format
   */
  async setLinkedProjectsMetadataV2(
    projects: LinkedProjectMetadataV2[],
  ): Promise<void> {
    await this.context.globalState.update(LINKED_PROJECTS_V2_KEY, projects);
  }

  /**
   * Get all linked projects with their access tokens - V2 format
   */
  async getLinkedProjectsV2(): Promise<LinkedProjectV2[]> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();

    const projects = await Promise.all(
      metadata.map(async (m) => {
        const accessToken = await this.getAccessTokenForProject(m.projectId);
        return { ...m, accessToken: accessToken || "" };
      }),
    );

    return projects.filter((p) => p.accessToken);
  }

  /**
   * Get a single linked project by ID - V2 format
   */
  async getLinkedProjectV2(projectId: string): Promise<LinkedProjectV2 | null> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const project = metadata.find((p) => p.projectId === projectId);

    if (!project) {
      return null;
    }

    const accessToken = await this.getAccessTokenForProject(projectId);
    if (!accessToken) {
      return null;
    }

    return { ...project, accessToken };
  }

  /**
   * Add a new linked project - V2 format
   */
  async addLinkedProjectV2(
    projectId: string,
    projectName: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number,
    directory: LinkedDirectory,
    defaultEnvironment: string,
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();

    // Check if project already exists
    const existingIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (existingIndex !== -1) {
      // Add directory to existing project
      const normalizedPath = normalizePath(directory.directoryPath);
      const existingDir = metadata[existingIndex].directories.find(
        (d) => normalizePath(d.directoryPath) === normalizedPath,
      );

      if (!existingDir) {
        metadata[existingIndex] = {
          ...metadata[existingIndex],
          directories: [
            ...metadata[existingIndex].directories,
            { ...directory, directoryPath: normalizedPath },
          ],
          updatedAt: Date.now(),
        };
      }
    } else {
      // Create new project
      await this.setAccessTokenForProject(projectId, accessToken);

      metadata.push({
        projectId,
        projectName,
        organizationName,
        expiresAt,
        directories: [
          {
            ...directory,
            directoryPath: normalizePath(directory.directoryPath),
          },
        ],
        defaultEnvironment,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await this.setLinkedProjectsMetadataV2(metadata);
  }

  /**
   * Add a directory to an existing project - V2 format
   */
  async addDirectoryToProject(
    projectId: string,
    directory: LinkedDirectory,
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const projectIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (projectIndex === -1) {
      throw new Error("Project not found");
    }

    // Check for duplicate directory
    const normalizedPath = normalizePath(directory.directoryPath);
    const existingDir = metadata[projectIndex].directories.find(
      (d) => normalizePath(d.directoryPath) === normalizedPath,
    );

    if (existingDir) {
      throw new Error("Directory already linked to this project");
    }

    metadata[projectIndex] = {
      ...metadata[projectIndex],
      directories: [
        ...metadata[projectIndex].directories,
        { ...directory, directoryPath: normalizedPath },
      ],
      updatedAt: Date.now(),
    };

    await this.setLinkedProjectsMetadataV2(metadata);
  }

  /**
   * Remove a directory from a project - V2 format
   */
  async removeDirectoryFromProject(
    projectId: string,
    directoryPath: string,
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const projectIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (projectIndex === -1) {
      return;
    }

    const normalizedPath = normalizePath(directoryPath);
    metadata[projectIndex] = {
      ...metadata[projectIndex],
      directories: metadata[projectIndex].directories.filter(
        (d) => normalizePath(d.directoryPath) !== normalizedPath,
      ),
      updatedAt: Date.now(),
    };

    // If no directories left, remove the entire project
    if (metadata[projectIndex].directories.length === 0) {
      await this.deleteAccessTokenForProject(projectId);
      metadata.splice(projectIndex, 1);
    }

    await this.setLinkedProjectsMetadataV2(metadata);
  }

  /**
   * Get the project linked to a specific directory - V2 format
   */
  async getProjectForDirectory(
    directoryPath: string,
  ): Promise<LinkedProjectV2 | null> {
    await this.migrateIfNeeded();

    const projects = await this.getLinkedProjectsV2();
    const normalizedPath = normalizePath(directoryPath);

    return (
      projects.find((p) =>
        p.directories.some(
          (d) => normalizePath(d.directoryPath) === normalizedPath,
        ),
      ) || null
    );
  }

  /**
   * Get all directories for a project - V2 format
   */
  async getAllDirectoriesForProject(
    projectId: string,
  ): Promise<LinkedDirectory[]> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const project = metadata.find((p) => p.projectId === projectId);
    return project?.directories || [];
  }

  /**
   * Update a directory's sync timestamp - V2 format
   */
  async updateDirectorySyncTime(
    projectId: string,
    directoryPath: string,
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const projectIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (projectIndex === -1) {
      return;
    }

    const normalizedPath = normalizePath(directoryPath);
    const dirIndex = metadata[projectIndex].directories.findIndex(
      (d) => normalizePath(d.directoryPath) === normalizedPath,
    );

    if (dirIndex !== -1) {
      const updatedDirectories = [...metadata[projectIndex].directories];
      updatedDirectories[dirIndex] = {
        ...updatedDirectories[dirIndex],
        lastSyncedAt: Date.now(),
      };
      metadata[projectIndex] = {
        ...metadata[projectIndex],
        directories: updatedDirectories,
        updatedAt: Date.now(),
      };
      await this.setLinkedProjectsMetadataV2(metadata);
    }
  }

  /**
   * Update project expiration - V2 format
   */
  async updateProjectExpiration(
    projectId: string,
    expiresAt: number,
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const projectIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (projectIndex !== -1) {
      metadata[projectIndex] = {
        ...metadata[projectIndex],
        expiresAt,
        updatedAt: Date.now(),
      };
      await this.setLinkedProjectsMetadataV2(metadata);
    }
  }

  /**
   * Remove an entire project and all its directories - V2 format
   */
  async removeLinkedProjectV2(projectId: string): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const filtered = metadata.filter((p) => p.projectId !== projectId);

    await this.deleteAccessTokenForProject(projectId);
    await this.setLinkedProjectsMetadataV2(filtered);
  }

  // Clear all stored data
  async clearAll(): Promise<void> {
    await this.clearAuthSession();

    // Delete all V1 access tokens
    const metadata = this.getLinkedProjectsMetadata();
    for (const m of metadata) {
      await this.deleteAccessToken(m.projectId, m.workspacePath);
    }

    // Delete all V2 access tokens
    const metadataV2 = this.getLinkedProjectsMetadataV2();
    for (const m of metadataV2) {
      await this.deleteAccessTokenForProject(m.projectId);
    }

    await this.setLinkedProjectsMetadata([]);
    await this.setLinkedProjectsMetadataV2([]);
  }
}
