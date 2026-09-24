import { describe, it, expect, vi } from "vitest";

vi.mock("vscode", () => ({
  window: { showWarningMessage: vi.fn(), showErrorMessage: vi.fn() },
  EventEmitter: class {
    event = () => {};
    fire() {}
    dispose() {}
  },
}));

vi.mock("../utils/config", () => ({
  getConvexUrl: () => "",
}));

import * as vscode from "vscode";
import { RealTimeSyncService } from "./realTimeSync";
import type { SyncService } from "./sync";
import type { StorageService } from "../utils/storage";
import type { ConvexService, RevocationEvent } from "./convex";
import type { LinkedProjectV2 } from "../types";

function project(projectId: string): LinkedProjectV2 {
  return {
    projectId,
    projectName: projectId,
    organizationId: "o1",
    organizationName: "Org",
    accessToken: "token",
    expiresAt: 0,
    directories: [],
    defaultEnvironment: "development",
    createdAt: 0,
    updatedAt: 0,
  };
}

function revoked(eventId: string, projectId: string): RevocationEvent {
  return {
    accessToken: "token",
    eventId,
    projectId,
    userId: "u1",
    reason: "revoked",
    revokedAt: 0,
  };
}

function setup(getLinkedProjectsV2: () => Promise<LinkedProjectV2[]>) {
  const onRevocation: Array<(events: RevocationEvent[]) => void> = [];
  const convex = {
    subscribeToRevocations: vi.fn(
      (callback: (events: RevocationEvent[]) => void) => {
        onRevocation.push(callback);
        return `revocations-${onRevocation.length}`;
      }
    ),
    subscribeToProjectAccess: vi.fn(() => "access"),
    unsubscribe: vi.fn(),
    acknowledgeRevocations: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  };
  const cleanupAllDirectories = vi.fn(async () => 1);
  const sync = {
    setConnectionState: vi.fn(),
    cleanupAllDirectories,
  } as unknown as SyncService;
  const storage = { getLinkedProjectsV2 } as unknown as StorageService;
  const service = new RealTimeSyncService(sync, storage, async () => null);
  service.setConvexService(convex as unknown as ConvexService);
  return { service, convex, onRevocation, cleanupAllDirectories };
}

describe("RealTimeSyncService", () => {
  it("processes a revocation that arrives while another is in progress", async () => {
    const { service, onRevocation, cleanupAllDirectories } = setup(async () => [
      project("a"),
      project("b"),
    ]);
    await service.startRealTimeSync();

    const deliver = onRevocation[0];
    deliver([revoked("e1", "a")]);
    deliver([revoked("e2", "b")]);

    await vi.waitFor(() =>
      expect(cleanupAllDirectories).toHaveBeenCalledTimes(2)
    );
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining("except 1 you edited locally"),
      "OK"
    );
    service.dispose();
  });

  it("retries subscription setup after a failed start", async () => {
    let calls = 0;
    const { service, convex } = setup(async () => {
      calls++;
      if (calls === 1) throw new Error("offline");
      return [project("a")];
    });

    await expect(service.startRealTimeSync()).rejects.toThrow("offline");
    await service.startRealTimeSync();

    expect(convex.subscribeToRevocations).toHaveBeenCalledTimes(1);
    service.dispose();
  });
});
