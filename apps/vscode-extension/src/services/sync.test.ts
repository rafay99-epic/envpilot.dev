import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("vscode", () => ({
  workspace: { isTrusted: true },
  window: { showWarningMessage: vi.fn() },
  EventEmitter: class<T> {
    private listeners: Array<(value: T) => void> = [];
    event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
    };
    fire(value: T) {
      for (const listener of this.listeners) listener(value);
    }
    dispose() {}
  },
}));

vi.mock("../utils/config", () => ({
  getEnvironment: () => "development",
  getTargetFile: () => ".env",
  shouldPreventCopyOnRevoke: () => true,
}));

import { SyncService } from "./sync";
import { recordManagedFile } from "../utils/managedFiles";
import type { ApiService, SecretFileRow } from "./api";
import type { StorageService } from "../utils/storage";
import type {
  EnvironmentVariable,
  LinkedDirectory,
  LinkedProjectV2,
} from "../types";

let home: string;
let dir: string;
let previousHome: string | undefined;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "envpilot-sync-home-"));
  dir = mkdtempSync(join(tmpdir(), "envpilot-sync-dir-"));
  previousHome = process.env.HOME;
  process.env.HOME = home;
});

afterEach(() => {
  process.env.HOME = previousHome;
  rmSync(home, { recursive: true, force: true });
  rmSync(dir, { recursive: true, force: true });
});

function variable(key: string, value: string): EnvironmentVariable {
  return {
    _id: key,
    key,
    value,
    description: null,
    environments: ["development"],
    projectId: "p1",
    isSensitive: false,
    version: 1,
  };
}

function setup(options: {
  writable?: boolean;
  getVariables?: () => Promise<EnvironmentVariable[]>;
  listSecretFiles?: () => Promise<SecretFileRow[]>;
}) {
  const directory: LinkedDirectory = {
    directoryPath: dir,
    targetFile: ".env",
    environments: ["development"],
    lastSyncedAt: null,
    createdAt: 0,
  };
  const project: LinkedProjectV2 = {
    projectId: "p1",
    projectName: "Demo",
    organizationId: "o1",
    organizationName: "Org",
    accessToken: "token",
    expiresAt: 0,
    directories: [directory],
    defaultEnvironment: "development",
    createdAt: 0,
    updatedAt: 0,
  };
  let linked: LinkedProjectV2 | null = project;
  const api = {
    getVariables:
      options.getVariables ?? (async () => [variable("API_KEY", "secret")]),
    getAccessMeta: () => ({
      hasWriteAccess: options.writable ?? true,
      capabilities: {},
    }),
    getProjectRole: () => undefined,
    getUserRole: () => "owner",
    listSecretFiles: options.listSecretFiles ?? (async () => []),
    getSecretFileContent: async () => ({
      name: "key",
      path: "key.pem",
      mode: "0600",
      size: 6,
      sha256: "",
      content: Buffer.from("secret").toString("base64"),
    }),
  } as unknown as ApiService;
  const storage = {
    getLinkedProjectV2: async () => linked,
    addLinkedProjectV2: vi.fn(async () => {}),
    addDirectoryToProject: vi.fn(async () => {}),
    removeDirectoryFromProject: vi.fn(async () => {
      linked = null;
    }),
    removeLinkedProjectV2: vi.fn(async () => {
      linked = null;
    }),
    updateDirectorySyncTime: async () => {},
    setProjectUnsyncFlag: async () => {},
  };
  const sync = new SyncService(api, storage as unknown as StorageService);
  return { sync, storage, project, directory, envPath: join(dir, ".env") };
}

describe("SyncService", () => {
  it("writes a writable .env as 0600 and a read-only one as 0400", async () => {
    const writable = setup({ writable: true });
    await writable.sync.syncDirectory(writable.project, writable.directory);
    expect((await fs.stat(writable.envPath)).mode & 0o777).toBe(0o600);

    await fs.rm(writable.envPath, { force: true });
    const readonly = setup({ writable: false });
    await readonly.sync.syncDirectory(readonly.project, readonly.directory);
    expect((await fs.stat(readonly.envPath)).mode & 0o777).toBe(0o400);
  });

  it("fires onSyncComplete once per directory sync, realtime path included", async () => {
    const { sync, project, directory } = setup({});
    const results: boolean[] = [];
    sync.onSyncComplete((result) => results.push(result.success));
    await sync.syncDirectory(project, directory);
    await sync.syncAllDirectories(project);
    expect(results).toEqual([true, true]);
  });

  it("revocation waits for an in-flight write, then removes what it wrote", async () => {
    let reached: () => void = () => {};
    const atSecretFiles = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let release: (files: SecretFileRow[]) => void = () => {};
    const { sync, storage, project, directory, envPath } = setup({
      listSecretFiles: () => {
        reached();
        return new Promise((resolve) => {
          release = resolve;
        });
      },
    });
    const pending = sync.syncDirectory(project, directory);
    await atSecretFiles;
    const cleanup = sync.cleanupAllDirectories(project);
    expect(storage.removeLinkedProjectV2).toHaveBeenCalled();
    release([{ _id: "f1", path: "key.pem", mode: "0600" } as SecretFileRow]);
    await Promise.all([pending, cleanup]);
    await expect(fs.access(envPath)).rejects.toThrow();
    await expect(fs.access(join(dir, "key.pem"))).rejects.toThrow();
  });

  it("does not write into a directory removed while values are in flight", async () => {
    let release: (vars: EnvironmentVariable[]) => void = () => {};
    const { sync, project, directory, envPath } = setup({
      getVariables: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = sync.syncDirectory(project, directory);
    const removing = sync.removeDirectoryFromProject(project.projectId, dir);
    release([variable("API_KEY", "secret")]);
    await removing;
    expect((await pending).success).toBe(false);
    await expect(fs.access(envPath)).rejects.toThrow();
  });

  it("removing a directory deletes a synced .env but spares a hand-edited one", async () => {
    const { sync, project, directory, envPath } = setup({});
    await sync.syncDirectory(project, directory);
    await sync.removeDirectoryFromProject(project.projectId, dir);
    await expect(fs.access(envPath)).rejects.toThrow();

    const second = setup({});
    await second.sync.syncDirectory(second.project, second.directory);
    await fs.writeFile(second.envPath, "MINE=1\n");
    await second.sync.removeDirectoryFromProject(second.project.projectId, dir);
    expect(await fs.readFile(second.envPath, "utf-8")).toBe("MINE=1\n");
  });

  it("revocation cleanup spares a hand-written .env never recorded in the manifest", async () => {
    const { sync, project, envPath } = setup({});
    await fs.writeFile(envPath, "MINE=1\n");
    await recordManagedFile(join(dir, "other"), "x");
    await sync.cleanupAllDirectories(project);
    expect(await fs.readFile(envPath, "utf-8")).toBe("MINE=1\n");
  });

  it("skip leaves the directory unlinked and the file untouched", async () => {
    const { sync, storage, envPath } = setup({});
    await fs.writeFile(envPath, "MINE=1\n");
    const linked = await sync.linkProjectWithDirectory(
      "p1",
      "Demo",
      "o1",
      "Org",
      "token",
      0,
      { directoryPath: dir, conflictStrategy: "skip" }
    );
    expect(linked).toBeNull();
    expect(storage.addLinkedProjectV2).not.toHaveBeenCalled();
    expect(await fs.readFile(envPath, "utf-8")).toBe("MINE=1\n");
  });

  it("treats any non-empty existing file as a conflict", async () => {
    const { sync, envPath } = setup({});
    await fs.writeFile(envPath, "export lower_key = value\n");
    const conflict = await sync.checkForConflicts(dir, ".env", ["development"]);
    expect(conflict.hasConflict).toBe(true);
    expect(conflict.existingVariableCount).toBe(1);
  });
});
