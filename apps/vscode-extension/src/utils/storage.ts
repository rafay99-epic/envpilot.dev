import type * as vscode from "vscode";
import type {
  AuthSession,
  LinkedProject,
  LinkedProjectV2,
  LinkedDirectory,
} from "../types";
import { normalizePath } from "./paths";

const AUTH_SESSION_KEY = "envpilot.authSession";
const AUTH_ACCOUNTS_KEY = "envpilot.authAccounts";
const LINKED_PROJECTS_KEY = "envpilot.linkedProjects";
const LINKED_PROJECTS_V2_KEY = "envpilot.linkedProjectsV2";
const ACCESS_TOKEN_PREFIX = "envpilot.token.";
const PROJECT_TOKEN_PREFIX = "envpilot.projectToken.";
const STORAGE_VERSION_KEY = "envpilot.storageVersion";
const CURRENT_STORAGE_VERSION = 2;

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
  autoUnsyncOnClose?: boolean;
}

interface AuthAccountsBlob {
  accounts: Record<string, AuthSession>;
  activeAccountId?: string;
}

export class StorageService {
  private context: vscode.ExtensionContext;
  private migrationComplete = false;
  private cachedAccounts: AuthAccountsBlob | undefined = undefined;
  private accountsLoadPromise: Promise<AuthAccountsBlob> | undefined;
  private accountsGeneration = 0;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    context.subscriptions.push(
      context.secrets.onDidChange((e) => {
        if (e.key === AUTH_ACCOUNTS_KEY) {
          this.accountsGeneration++;
          this.cachedAccounts = undefined;
          this.accountsLoadPromise = undefined;
        }
      })
    );
  }

  getContext(): vscode.ExtensionContext {
    return this.context;
  }

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

  private async migrateV1ToV2(): Promise<void> {
    const oldProjects = this.getLinkedProjectsMetadata();
    const newProjects: LinkedProjectMetadataV2[] = [];

    for (const old of oldProjects) {
      const directory: LinkedDirectory = {
        directoryPath: normalizePath(old.workspacePath),
        targetFile: old.targetFile,
        environments: [old.environment],
        lastSyncedAt: old.lastSyncedAt,
        createdAt: Date.now(),
      };

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

  private async loadAccounts(): Promise<AuthAccountsBlob> {
    if (this.cachedAccounts !== undefined) {
      return this.cachedAccounts;
    }
    if (!this.accountsLoadPromise) {
      const generation = this.accountsGeneration;
      const load: Promise<AuthAccountsBlob> = this.doLoadAccounts()
        .then((blob) => {
          if (this.accountsGeneration === generation) {
            this.cachedAccounts = blob;
          }
          return blob;
        })
        .finally(() => {
          if (this.accountsLoadPromise === load) {
            this.accountsLoadPromise = undefined;
          }
        });
      this.accountsLoadPromise = load;
    }
    return this.accountsLoadPromise;
  }

  private async doLoadAccounts(): Promise<AuthAccountsBlob> {
    const raw = await this.context.secrets.get(AUTH_ACCOUNTS_KEY);
    if (raw) {
      try {
        return this.normalizeBlob(JSON.parse(raw) as AuthAccountsBlob);
      } catch {}
    }
    return this.migrateLegacyAuth();
  }

  private normalizeBlob(blob: AuthAccountsBlob | null): AuthAccountsBlob {
    const accounts =
      blob && typeof blob.accounts === "object" && blob.accounts !== null
        ? blob.accounts
        : {};
    const id = blob?.activeAccountId;
    return { accounts, activeAccountId: id && accounts[id] ? id : undefined };
  }

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

  private async persistAccounts(blob: AuthAccountsBlob): Promise<void> {
    this.cachedAccounts = blob;
    await this.context.secrets.store(AUTH_ACCOUNTS_KEY, JSON.stringify(blob));
  }

  private enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(task, task);
    this.writeQueue = run.catch(() => {});
    return run;
  }

  async getAuthSession(): Promise<AuthSession | null> {
    let blob = await this.loadAccounts();

    for (;;) {
      const id = blob.activeAccountId;
      if (!id) {
        return null;
      }

      const session = blob.accounts[id];
      if (!session) {
        await this.enqueueWrite(async () => {
          const current = await this.loadAccounts();
          await this.persistAccounts(this.normalizeBlob(current));
        });
        blob = await this.loadAccounts();
        continue;
      }

      if (session.expiresAt && Date.now() > session.expiresAt) {
        await this.removeAccount(id, { promote: true });
        blob = await this.loadAccounts();
        continue;
      }

      return session;
    }
  }

  async setAuthSession(session: AuthSession): Promise<void> {
    await this.enqueueWrite(async () => {
      const blob = await this.loadAccounts();
      await this.persistAccounts({
        accounts: { ...blob.accounts, [session.user.id]: session },
        activeAccountId: session.user.id,
      });
    });
  }

  async updateAccountTokens(
    userId: string,
    patch: { accessToken: string; refreshToken: string; sessionId?: string }
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const blob = await this.loadAccounts();
      const existing = blob.accounts[userId];
      if (!existing) {
        return;
      }
      await this.persistAccounts({
        accounts: {
          ...blob.accounts,
          [userId]: {
            ...existing,
            accessToken: patch.accessToken,
            refreshToken: patch.refreshToken,
            sessionId: patch.sessionId ?? existing.sessionId,
            expiresAt: 0,
          },
        },
        activeAccountId: blob.activeAccountId,
      });
    });
  }

  async listAccounts(): Promise<AuthSession[]> {
    const blob = await this.loadAccounts();
    return Object.values(blob.accounts);
  }

  async getActiveAccountId(): Promise<string | undefined> {
    return (await this.loadAccounts()).activeAccountId;
  }

  async setActiveAccount(userId: string): Promise<boolean> {
    return this.enqueueWrite(async () => {
      const blob = await this.loadAccounts();
      if (!blob.accounts[userId]) {
        return false;
      }
      await this.persistAccounts({ ...blob, activeAccountId: userId });
      return true;
    });
  }

  async removeAccount(
    userId: string,
    { promote }: { promote: boolean }
  ): Promise<void> {
    await this.enqueueWrite(async () => {
      const blob = await this.loadAccounts();
      if (!blob.accounts[userId]) return;
      const { [userId]: _removed, ...accounts } = blob.accounts;
      const activeAccountId =
        blob.activeAccountId !== userId
          ? blob.activeAccountId
          : promote
            ? Object.keys(accounts)[0]
            : undefined;
      await this.persistAccounts({ accounts, activeAccountId });
    });
  }

  async clearAllAccounts(): Promise<void> {
    await this.enqueueWrite(async () => {
      this.cachedAccounts = { accounts: {}, activeAccountId: undefined };
      await this.context.secrets.delete(AUTH_ACCOUNTS_KEY);
      await this.context.secrets.delete(AUTH_SESSION_KEY);
    });
  }

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

  async getAccessToken(
    projectId: string,
    workspacePath: string
  ): Promise<string | null> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    return (await this.context.secrets.get(key)) || null;
  }

  async setAccessToken(
    projectId: string,
    workspacePath: string,
    token: string
  ): Promise<void> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    await this.context.secrets.store(key, token);
  }

  async deleteAccessToken(
    projectId: string,
    workspacePath: string
  ): Promise<void> {
    const key = `${ACCESS_TOKEN_PREFIX}${projectId}:${Buffer.from(workspacePath).toString("base64")}`;
    await this.context.secrets.delete(key);
  }

  async addLinkedProject(project: LinkedProject): Promise<void> {
    const metadata = this.getLinkedProjectsMetadata();

    const filtered = metadata.filter(
      (p) =>
        !(
          p.projectId === project.projectId &&
          p.workspacePath === project.workspacePath
        )
    );

    await this.setAccessToken(
      project.projectId,
      project.workspacePath,
      project.accessToken
    );

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
      if (updates.accessToken) {
        await this.setAccessToken(
          projectId,
          workspacePath,
          updates.accessToken
        );
      }

      const { accessToken, ...metadataUpdates } = updates;
      metadata[index] = { ...metadata[index], ...metadataUpdates };
      await this.setLinkedProjectsMetadata(metadata);
    }
  }

  async getAccessTokenForProject(projectId: string): Promise<string | null> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    return (await this.context.secrets.get(key)) || null;
  }

  async setAccessTokenForProject(
    projectId: string,
    token: string
  ): Promise<void> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    await this.context.secrets.store(key, token);
  }

  async deleteAccessTokenForProject(projectId: string): Promise<void> {
    const key = `${PROJECT_TOKEN_PREFIX}${projectId}`;
    await this.context.secrets.delete(key);
  }

  getLinkedProjectsMetadataV2(): LinkedProjectMetadataV2[] {
    return (
      this.context.globalState.get<LinkedProjectMetadataV2[]>(
        LINKED_PROJECTS_V2_KEY
      ) || []
    );
  }

  async setLinkedProjectsMetadataV2(
    projects: LinkedProjectMetadataV2[]
  ): Promise<void> {
    await this.context.globalState.update(LINKED_PROJECTS_V2_KEY, projects);
  }

  private updateProject(
    projectId: string,
    update: (project: LinkedProjectMetadataV2) => LinkedProjectMetadataV2 | null
  ): Promise<boolean> {
    return this.enqueueWrite(async () => {
      await this.migrateIfNeeded();
      const metadata = this.getLinkedProjectsMetadataV2();
      const index = metadata.findIndex((p) => p.projectId === projectId);
      if (index === -1) return false;
      const next = update(metadata[index]);
      if (next === metadata[index]) return true;
      if (next) {
        metadata[index] = { ...next, updatedAt: Date.now() };
      } else {
        await this.deleteAccessTokenForProject(projectId);
        metadata.splice(index, 1);
      }
      await this.setLinkedProjectsMetadataV2(metadata);
      return true;
    });
  }

  async setProjectUnsyncFlag(projectId: string, value: boolean): Promise<void> {
    await this.updateProject(projectId, (project) =>
      project.autoUnsyncOnClose === value
        ? project
        : { ...project, autoUnsyncOnClose: value }
    );
  }

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
    return this.enqueueWrite(async () => {
      await this.migrateIfNeeded();

      const metadata = this.getLinkedProjectsMetadataV2();

      const existingIndex = metadata.findIndex(
        (p) => p.projectId === projectId
      );

      if (existingIndex !== -1) {
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
    });
  }

  async addDirectoryToProject(
    projectId: string,
    directory: LinkedDirectory
  ): Promise<void> {
    const directoryPath = normalizePath(directory.directoryPath);
    const found = await this.updateProject(projectId, (project) => {
      if (
        project.directories.some(
          (d) => normalizePath(d.directoryPath) === directoryPath
        )
      ) {
        throw new Error("Directory already linked to this project");
      }
      return {
        ...project,
        directories: [...project.directories, { ...directory, directoryPath }],
      };
    });
    if (!found) throw new Error("Project not found");
  }

  async removeDirectoryFromProject(
    projectId: string,
    directoryPath: string
  ): Promise<void> {
    const normalizedPath = normalizePath(directoryPath);
    await this.updateProject(projectId, (project) => {
      const directories = project.directories.filter(
        (d) => normalizePath(d.directoryPath) !== normalizedPath
      );
      return directories.length > 0 ? { ...project, directories } : null;
    });
  }

  async updateDirectorySyncTime(
    projectId: string,
    directoryPath: string
  ): Promise<void> {
    const normalizedPath = normalizePath(directoryPath);
    await this.updateProject(projectId, (project) => ({
      ...project,
      directories: project.directories.map((d) =>
        normalizePath(d.directoryPath) === normalizedPath
          ? { ...d, lastSyncedAt: Date.now() }
          : d
      ),
    }));
  }

  async removeLinkedProjectV2(projectId: string): Promise<void> {
    await this.updateProject(projectId, () => null);
  }
}
