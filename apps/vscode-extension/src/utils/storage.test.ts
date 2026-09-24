import { describe, it, expect } from "vitest";
import type * as vscode from "vscode";

import { StorageService } from "./storage";
import type { LinkedDirectory } from "../types";

type FakeContext = vscode.ExtensionContext & {
  secretsMap: Map<string, string>;
  fireSecretChange: (key: string) => void;
};

function fakeContext(): FakeContext {
  const state = new Map<string, unknown>([["envpilot.storageVersion", 2]]);
  const secrets = new Map<string, string>();
  const listeners: Array<(e: { key: string }) => void> = [];
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  return {
    subscriptions: [],
    secretsMap: secrets,
    fireSecretChange: (key: string) => listeners.forEach((l) => l({ key })),
    globalState: {
      get: (key: string) => structuredClone(state.get(key)),
      update: async (key: string, value: unknown) => {
        await tick();
        state.set(key, structuredClone(value));
      },
    },
    secrets: {
      get: async (key: string) => {
        await tick();
        return secrets.get(key);
      },
      store: async (key: string, value: string) => {
        await tick();
        secrets.set(key, value);
      },
      delete: async (key: string) => {
        await tick();
        secrets.delete(key);
      },
      onDidChange: (listener: (e: { key: string }) => void) => {
        listeners.push(listener);
        return { dispose: () => {} };
      },
    },
  } as unknown as FakeContext;
}

function directory(directoryPath: string): LinkedDirectory {
  return {
    directoryPath,
    targetFile: ".env",
    environments: ["development"],
    lastSyncedAt: null,
    createdAt: 0,
  };
}

describe("StorageService metadata writes", () => {
  it("keeps every change when mutations overlap", async () => {
    const storage = new StorageService(fakeContext());
    await storage.addLinkedProjectV2(
      "p1",
      "Demo",
      "o1",
      "Org",
      "token",
      0,
      directory("/work/a"),
      "development"
    );

    await Promise.all([
      storage.addLinkedProjectV2(
        "p2",
        "Other",
        "o1",
        "Org",
        "token",
        0,
        directory("/work/b"),
        "development"
      ),
      storage.addDirectoryToProject("p1", directory("/work/c")),
      storage.updateDirectorySyncTime("p1", "/work/a"),
      storage.setProjectUnsyncFlag("p1", false),
    ]);

    const [p1, p2] = storage.getLinkedProjectsMetadataV2();
    expect(p1.directories.map((d) => d.directoryPath)).toEqual([
      "/work/a",
      "/work/c",
    ]);
    expect(p1.directories[0].lastSyncedAt).not.toBeNull();
    expect(p1.autoUnsyncOnClose).toBe(false);
    expect(p2.projectId).toBe("p2");
  });
});

describe("StorageService account cache", () => {
  const session = (id: string) => ({
    user: { id, email: `${id}@x.dev`, name: null, avatarUrl: null },
    accessToken: "a",
    refreshToken: `rt-${id}`,
    expiresAt: 0,
  });

  it("drops the cache when another window rewrites the accounts secret", async () => {
    const context = fakeContext();
    const storage = new StorageService(context);
    await storage.setAuthSession(session("u1"));
    expect((await storage.getAuthSession())?.refreshToken).toBe("rt-u1");

    context.secretsMap.set(
      "envpilot.authAccounts",
      JSON.stringify({
        accounts: { u1: { ...session("u1"), refreshToken: "rt-rotated" } },
        activeAccountId: "u1",
      })
    );
    expect((await storage.getAuthSession())?.refreshToken).toBe("rt-u1");

    context.fireSecretChange("envpilot.authAccounts");
    expect((await storage.getAuthSession())?.refreshToken).toBe("rt-rotated");
  });

  it("a dead session leaves no active account instead of promoting another", async () => {
    const context = fakeContext();
    const storage = new StorageService(context);
    await storage.setAuthSession(session("u2"));
    await storage.setAuthSession(session("u1"));

    await storage.removeAccount("u1", { promote: false });
    context.fireSecretChange("envpilot.authAccounts");

    expect(await storage.getAuthSession()).toBeNull();
    expect((await storage.listAccounts()).map((a) => a.user.id)).toEqual([
      "u2",
    ]);
  });
});
