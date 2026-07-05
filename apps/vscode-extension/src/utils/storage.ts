import * as vscode from "vscode";
import type {
  AuthSession,
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
} from "../types";
import { normalizePath } from "./paths";

const AUTH_SESSION_KEY = "envpilot.authSession";
/**
 * Multi-account auth blob. Holds every signed-in account keyed by user id plus
 * a single active-account pointer, all inside one encrypted SecretStorage
 * entry. Supersedes the single-session AUTH_SESSION_KEY (migrated lazily).
 */
const AUTH_ACCOUNTS_KEY = "envpilot.authAccounts";
const LINKED_PROJECTS_KEY = "envpilot.linkedProjects";
const LINKED_PROJECTS_V2_KEY = "envpilot.linkedProjectsV2";
const ACCESS_TOKEN_PREFIX = "envpilot.token.";
const PROJECT_TOKEN_PREFIX = "envpilot.projectToken.";
const STORAGE_VERSION_KEY = "envpilot.storageVersion";
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
  organizationId: string;
  organizationName: string;
  expiresAt: number;
  directories: LinkedDirectory[];
  defaultEnvironment: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Multi-account auth storage blob (persisted under AUTH_ACCOUNTS_KEY).
 * `accounts` is keyed by user id; `activeAccountId` points at the account the
 * legacy single-session API (getAuthSession/setAuthSession/clearAuthSession)
 * operates on. Mirrors the CLI's `{ accounts, activeAccountId }` config shape.
 */
interface AuthAccountsBlob {
  accounts: Record<string, AuthSession>;
  activeAccountId?: string;
}

/**
 * Storage service for persisting extension state securely
 * Access tokens are stored in VS Code's secret storage for security
 */
export class StorageService {
  private context: vscode.ExtensionContext;
  private migrationComplete = false;
  /**
   * In-memory copy of the multi-account auth blob. Secret storage is an async
   * IPC call and the API client reads the active session on every request —
   * cache the whole blob and invalidate on every mutation. `undefined` means
   * "not loaded yet"; a loaded-but-empty state is `{ accounts: {} }`.
   */
  private cachedAccounts: AuthAccountsBlob | undefined = undefined;
  /**
   * De-dupes concurrent first-reads (which trigger legacy migration) so the
   * blob is only loaded/migrated once even under a burst of parallel reads.
   */
  private accountsLoadPromise: Promise<AuthAccountsBlob> | undefined;
  /**
   * Serializes account read-modify-write cycles (upsert/remove/switch) so two
   * concurrent mutations can't clobber each other's copy of the blob.
   */
  private authWriteQueue: Promise<unknown> = Promise.resolve();
  /** Serializes metadata read-modify-write cycles from concurrent syncs. */
  private metadataWriteQueue: Promise<void> = Promise.resolve();

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
        CURRENT_STORAGE_VERSION
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
        (p) => p.projectId === old.projectId
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
          old.workspacePath
        );
        if (oldToken) {
          await this.setAccessTokenForProject(old.projectId, oldToken);
        }

        newProjects.push({
          projectId: old.projectId,
          projectName: old.projectName,
          organizationId: "",
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

  // ============================================
  // Multi-account auth session management
  // ============================================
  //
  // Every signed-in account lives in one encrypted SecretStorage blob keyed by
  // user id, with a single active-account pointer. The legacy single-session
  // API (getAuthSession/setAuthSession/clearAuthSession) is preserved verbatim
  // and now operates on the ACTIVE account, so existing callers are unaffected.

  /**
   * Load the accounts blob (cached). On the very first read, if no blob exists
   * yet but a legacy single-session AUTH_SESSION_KEY does, it is migrated in
   * place (see {@link migrateLegacyAuth}). Concurrent first-reads share one
   * load via `accountsLoadPromise` so migration runs at most once.
   */
  private async loadAccounts(): Promise<AuthAccountsBlob> {
    if (this.cachedAccounts !== undefined) {
      return this.cachedAccounts;
    }
    if (!this.accountsLoadPromise) {
      this.accountsLoadPromise = this.doLoadAccounts().finally(() => {
        this.accountsLoadPromise = undefined;
      });
    }
    return this.accountsLoadPromise;
  }

  private async doLoadAccounts(): Promise<AuthAccountsBlob> {
    const raw = await this.context.secrets.get(AUTH_ACCOUNTS_KEY);
    if (raw) {
      try {
        const blob = this.normalizeBlob(JSON.parse(raw) as AuthAccountsBlob);
        this.cachedAccounts = blob;
        return blob;
      } catch {
        // Corrupt blob — fall through to legacy migration / empty state.
      }
    }

    const blob = await this.migrateLegacyAuth();
    this.cachedAccounts = blob;
    return blob;
  }

  /**
   * Repair an untrusted blob: guarantee an `accounts` object and an
   * `activeAccountId` that actually points at a stored account (falling back to
   * an arbitrary remaining account, or `undefined` when there are none).
   */
  private normalizeBlob(blob: AuthAccountsBlob | null): AuthAccountsBlob {
    const accounts =
      blob && typeof blob.accounts === "object" && blob.accounts !== null
        ? blob.accounts
        : {};
    let activeAccountId = blob?.activeAccountId;
    if (!activeAccountId || !accounts[activeAccountId]) {
      activeAccountId = Object.keys(accounts)[0];
    }
    return { accounts, activeAccountId };
  }

  /**
   * Lazy, idempotent migration from the legacy single-session AUTH_SESSION_KEY
   * to the multi-account blob. If a valid legacy session exists it is wrapped
   * into an accounts map keyed by its user id, made active, persisted, and the
   * legacy key is deleted. Lossless: the same AuthSession object is preserved
   * byte-for-byte, only re-homed under `accounts[user.id]`. Safe to call when
   * no legacy session exists (returns an empty blob without writing).
   */
  private async migrateLegacyAuth(): Promise<AuthAccountsBlob> {
    const legacy = await this.context.secrets.get(AUTH_SESSION_KEY);
    if (!legacy) {
      return { accounts: {}, activeAccountId: undefined };
    }

    let session: AuthSession | null = null;
    try {
      session = JSON.parse(legacy) as AuthSession;
    } catch {
      session = null;
    }

    if (!session?.user?.id) {
      // Legacy value is unusable — drop it so we don't retry every read.
      await this.context.secrets.delete(AUTH_SESSION_KEY);
      return { accounts: {}, activeAccountId: undefined };
    }

    const blob: AuthAccountsBlob = {
      accounts: { [session.user.id]: session },
      activeAccountId: session.user.id,
    };
    await this.persistAccounts(blob);
    await this.context.secrets.delete(AUTH_SESSION_KEY);
    return blob;
  }

  /** Persist the blob and update the in-memory cache atomically. */
  private async persistAccounts(blob: AuthAccountsBlob): Promise<void> {
    this.cachedAccounts = blob;
    await this.context.secrets.store(AUTH_ACCOUNTS_KEY, JSON.stringify(blob));
  }

  /** Serialize an account read-modify-write behind the auth write queue. */
  private enqueueAuthWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.authWriteQueue.then(task, task);
    this.authWriteQueue = run.catch(() => {});
    return run;
  }

  /**
   * Get the ACTIVE account's session (runs migration on first read). Returns
   * null when signed out. An expired active account is removed (which may
   * promote another account to active) but NEVER wipes other valid accounts;
   * expired accounts are skipped until a valid active session is found or none
   * remain.
   */
  async getAuthSession(): Promise<AuthSession | null> {
    let blob = await this.loadAccounts();

    for (;;) {
      const id = blob.activeAccountId;
      if (!id) {
        return null;
      }

      const session = blob.accounts[id];
      if (!session) {
        // Pointer/accounts drifted out of sync — normalize and retry.
        await this.enqueueAuthWrite(async () => {
          const current = await this.loadAccounts();
          await this.persistAccounts(this.normalizeBlob(current));
        });
        blob = await this.loadAccounts();
        continue;
      }

      if (session.expiresAt && Date.now() > session.expiresAt) {
        await this.removeAccount(id);
        blob = await this.loadAccounts();
        continue;
      }

      return session;
    }
  }

  /**
   * UPSERT an account by `session.user.id` and make it the active account. This
   * is what makes signIn ADD an account without clobbering the others.
   */
  async setAuthSession(session: AuthSession): Promise<void> {
    await this.enqueueAuthWrite(async () => {
      const blob = await this.loadAccounts();
      await this.persistAccounts({
        accounts: { ...blob.accounts, [session.user.id]: session },
        activeAccountId: session.user.id,
      });
    });
  }

  /**
   * Patch an EXISTING account's rotated tokens in place, for the token-refresh
   * path. Unlike setAuthSession this:
   *   - does NOT change `activeAccountId` — a background refresh of account A
   *     that finishes after the user switched to B must not flip active back to A;
   *   - does NOT resurrect an account that was removed (signed out / switched
   *     away) while its refresh was in flight — it is a no-op in that case,
   *     instead of silently re-creating cleared credentials.
   */
  async updateAccountTokens(
    userId: string,
    patch: { accessToken: string; refreshToken: string; sessionId?: string }
  ): Promise<void> {
    await this.enqueueAuthWrite(async () => {
      const blob = await this.loadAccounts();
      const existing = blob.accounts[userId];
      if (!existing) {
        return; // removed while the refresh was in flight — do not resurrect.
      }
      await this.persistAccounts({
        accounts: {
          ...blob.accounts,
          [userId]: {
            ...existing,
            accessToken: patch.accessToken,
            refreshToken: patch.refreshToken,
            sessionId: patch.sessionId ?? existing.sessionId,
            // Preserve the "never auto-evict" semantics.
            expiresAt: 0,
          },
        },
        activeAccountId: blob.activeAccountId, // unchanged — no active flip.
      });
    });
  }

  /**
   * Single-account logout: remove the ACTIVE account. If other accounts remain,
   * the active pointer moves to one of them; otherwise the blob becomes empty.
   */
  async clearAuthSession(): Promise<void> {
    const activeId = (await this.loadAccounts()).activeAccountId;
    if (!activeId) {
      return;
    }
    await this.removeAccount(activeId);
  }

  /** List every signed-in account. */
  async listAccounts(): Promise<AuthSession[]> {
    const blob = await this.loadAccounts();
    return Object.values(blob.accounts);
  }

  /** Get the active account's user id (undefined when signed out). */
  async getActiveAccountId(): Promise<string | undefined> {
    return (await this.loadAccounts()).activeAccountId;
  }

  /**
   * Switch the active account. Returns false (and changes nothing) when no
   * account with the given id exists.
   */
  async setActiveAccount(userId: string): Promise<boolean> {
    return this.enqueueAuthWrite(async () => {
      const blob = await this.loadAccounts();
      if (!blob.accounts[userId]) {
        return false;
      }
      await this.persistAccounts({ ...blob, activeAccountId: userId });
      return true;
    });
  }

  /**
   * Remove a specific account. If it was the active one, the active pointer
   * moves to another remaining account (or is cleared when none remain).
   */
  async removeAccount(
    userId: string
  ): Promise<{ removedActive: boolean; newActiveId?: string }> {
    return this.enqueueAuthWrite(async () => {
      const blob = await this.loadAccounts();
      if (!blob.accounts[userId]) {
        return { removedActive: false };
      }

      const wasActive = blob.activeAccountId === userId;
      const accounts = { ...blob.accounts };
      delete accounts[userId];

      let activeAccountId = blob.activeAccountId;
      let newActiveId: string | undefined;
      if (wasActive) {
        newActiveId = Object.keys(accounts)[0];
        activeAccountId = newActiveId;
      }

      await this.persistAccounts({ accounts, activeAccountId });
      return { removedActive: wasActive, newActiveId };
    });
  }

  /** Sign out of every account and clear the in-memory cache. */
  async clearAllAccounts(): Promise<void> {
    await this.enqueueAuthWrite(async () => {
      this.cachedAccounts = { accounts: {}, activeAccountId: undefined };
      await this.context.secrets.delete(AUTH_ACCOUNTS_KEY);
      // Also drop any un-migrated legacy session so nothing lingers.
      await this.context.secrets.delete(AUTH_SESSION_KEY);
    });
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
        LINKED_PROJECTS_KEY
      );
    return projects || [];
  }

  async setLinkedProjectsMetadata(
    projects: LinkedProjectMetadata[]
  ): Promise<void> {
    await this.context.globalState.update(LINKED_PROJECTS_KEY, projects);
  }

  /**
   * Get access token for a project from secret storage - V1 format
   */
  async getAccessToken(
    projectId: string,
    workspacePath: string
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
    token: string
  ): Promise<void> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    await this.context.secrets.store(key, token);
  }

  /**
   * Delete access token from secret storage - V1 format
   */
  async deleteAccessToken(
    projectId: string,
    workspacePath: string
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
          m.workspacePath
        );
        return {
          ...m,
          organizationId: "",
          accessToken: accessToken || "",
        };
      })
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
        )
    );

    // Store access token separately in secrets
    await this.setAccessToken(
      project.projectId,
      project.workspacePath,
      project.accessToken
    );

    // Store metadata without access token
    const { accessToken, ...metadataOnly } = project;
    filtered.push(metadataOnly);
    await this.setLinkedProjectsMetadata(filtered);
  }

  async removeLinkedProject(
    projectId: string,
    workspacePath: string
  ): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();
    const filtered = metadata.filter(
      (p) => !(p.projectId === projectId && p.workspacePath === workspacePath)
    );

    // Delete the access token
    await this.deleteAccessToken(projectId, workspacePath);

    await this.setLinkedProjectsMetadata(filtered);
  }

  async getLinkedProjectForWorkspace(
    workspacePath: string
  ): Promise<LinkedProject | null> {
    const metadata = this.getLinkedProjectsMetadata();
    const match = metadata.find((p) => p.workspacePath === workspacePath);

    if (!match) {
      return null;
    }

    const accessToken = await this.getAccessToken(
      match.projectId,
      match.workspacePath
    );
    if (!accessToken) {
      return null;
    }

    return { ...match, organizationId: "", accessToken };
  }

  async updateLinkedProject(
    projectId: string,
    workspacePath: string,
    updates: Partial<LinkedProject>
  ): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();
    const index = metadata.findIndex(
      (p) => p.projectId === projectId && p.workspacePath === workspacePath
    );

    if (index !== -1) {
      // If access token is being updated, store it separately
      if (updates.accessToken) {
        await this.setAccessToken(
          projectId,
          workspacePath,
          updates.accessToken
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
    token: string
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
        LINKED_PROJECTS_V2_KEY
      ) || []
    );
  }

  /**
   * Set linked projects metadata - V2 format
   */
  async setLinkedProjectsMetadataV2(
    projects: LinkedProjectMetadataV2[]
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
      })
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
    organizationId: string,
    organizationName: string,
    accessToken: string,
    expiresAt: number,
    directory: LinkedDirectory,
    defaultEnvironment: string
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();

    // Check if project already exists
    const existingIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (existingIndex !== -1) {
      // Add directory to existing project
      const normalizedPath = normalizePath(directory.directoryPath);
      const existingDir = metadata[existingIndex].directories.find(
        (d) => normalizePath(d.directoryPath) === normalizedPath
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
        organizationId,
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
    directory: LinkedDirectory
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
      (d) => normalizePath(d.directoryPath) === normalizedPath
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
    directoryPath: string
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
        (d) => normalizePath(d.directoryPath) !== normalizedPath
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
    directoryPath: string
  ): Promise<LinkedProjectV2 | null> {
    await this.migrateIfNeeded();

    const projects = await this.getLinkedProjectsV2();
    const normalizedPath = normalizePath(directoryPath);

    return (
      projects.find((p) =>
        p.directories.some(
          (d) => normalizePath(d.directoryPath) === normalizedPath
        )
      ) || null
    );
  }

  /**
   * Get all directories for a project - V2 format
   */
  async getAllDirectoriesForProject(
    projectId: string
  ): Promise<LinkedDirectory[]> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const project = metadata.find((p) => p.projectId === projectId);
    return project?.directories || [];
  }

  /**
   * Update a directory's sync timestamp - V2 format.
   * Queued so concurrent directory syncs don't clobber each other's
   * read-modify-write of the shared metadata array.
   */
  async updateDirectorySyncTime(
    projectId: string,
    directoryPath: string
  ): Promise<void> {
    const task = this.metadataWriteQueue.then(() =>
      this.doUpdateDirectorySyncTime(projectId, directoryPath)
    );
    this.metadataWriteQueue = task.catch(() => {});
    return task;
  }

  private async doUpdateDirectorySyncTime(
    projectId: string,
    directoryPath: string
  ): Promise<void> {
    await this.migrateIfNeeded();

    const metadata = this.getLinkedProjectsMetadataV2();
    const projectIndex = metadata.findIndex((p) => p.projectId === projectId);

    if (projectIndex === -1) {
      return;
    }

    const normalizedPath = normalizePath(directoryPath);
    const dirIndex = metadata[projectIndex].directories.findIndex(
      (d) => normalizePath(d.directoryPath) === normalizedPath
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
    expiresAt: number
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
    // Sign out of every account (clearAuthSession only drops the active one).
    await this.clearAllAccounts();

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
