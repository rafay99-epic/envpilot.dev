import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => ({
  EventEmitter: class {
    event = vi.fn();
    fire = vi.fn();
  },
}));

const captureError = vi.hoisted(() => vi.fn());

vi.mock("../utils/sentry", () => ({ captureError }));

import { RealTimeSyncService } from "./realTimeSync";
import type { ConvexService } from "./convex";
import type { SyncService } from "./sync";
import type { StorageService } from "../utils/storage";

describe("RealTimeSyncService subscription recovery", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captureError.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tears down all subscriptions and reconnects after a metadata error", async () => {
    let metadataErrorHandler: ((error: Error) => void) | undefined;
    let revocationErrorHandler: ((error: Error) => void) | undefined;
    const syncService = {
      setSubscriptionErrorHandler: vi.fn((handler: (error: Error) => void) => {
        metadataErrorHandler = handler;
      }),
      setConnectionState: vi.fn(),
      stopPeriodicSync: vi.fn(),
      startPeriodicSync: vi.fn(),
    } as unknown as SyncService;
    const storage = {
      getLinkedProjectsV2: vi
        .fn()
        .mockResolvedValue([{ projectId: "project", directories: [] }]),
    } as unknown as StorageService;
    const convexService = {
      isAuthenticated: true,
      subscribeToRevocations: vi.fn(
        (_callback, onError: (error: Error) => void) => {
          revocationErrorHandler = onError;
          return "revocations";
        }
      ),
      subscribeToProjectAccess: vi.fn().mockReturnValue("access"),
      unsubscribe: vi.fn(),
    } as unknown as ConvexService;
    const service = new RealTimeSyncService(
      syncService,
      storage,
      async () => "token"
    );
    service.setConvexService(convexService);

    await service.startRealTimeSync();
    metadataErrorHandler?.(new Error("metadata failed"));
    metadataErrorHandler?.(new Error("stale duplicate"));

    expect(syncService.stopPeriodicSync).toHaveBeenCalledOnce();
    expect(convexService.unsubscribe).toHaveBeenCalledTimes(2);
    expect(captureError).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(0);

    expect(convexService.subscribeToRevocations).toHaveBeenCalledTimes(2);
    expect(convexService.subscribeToProjectAccess).toHaveBeenCalledTimes(2);
    expect(syncService.startPeriodicSync).toHaveBeenCalledOnce();

    revocationErrorHandler?.(new Error("revocation still failing"));
    await vi.advanceTimersByTimeAsync(0);
    expect(convexService.subscribeToRevocations).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(convexService.subscribeToRevocations).toHaveBeenCalledTimes(3);

    service.stopRealTimeSync();
  });
});
