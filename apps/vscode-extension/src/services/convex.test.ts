import { beforeEach, describe, expect, it, vi } from "vitest";

const convexMock = vi.hoisted(() => ({
  onUpdate: vi.fn(),
  setAuth: vi.fn(),
}));

vi.mock("convex/browser", () => ({
  ConvexClient: class {
    setAuth(...args: unknown[]) {
      convexMock.setAuth(...args);
    }

    onUpdate(...args: unknown[]) {
      convexMock.onUpdate(...args);
      return vi.fn();
    }

    async close() {}

    async mutation() {}
  },
}));

import { ConvexService } from "./convex";

describe("ConvexService subscriptions", () => {
  beforeEach(() => {
    convexMock.onUpdate.mockClear();
    convexMock.setAuth.mockClear();
  });

  it("passes subscription errors to callers instead of leaving them unhandled", () => {
    const service = new ConvexService(
      "https://convex.example",
      async () => "token"
    );
    const onError = vi.fn();

    service.subscribeToRevocations(vi.fn(), onError);
    service.subscribeToProjectAccess(vi.fn(), onError);
    service.subscribeToVariableMetadata("project", undefined, vi.fn(), onError);

    expect(convexMock.onUpdate).toHaveBeenCalledTimes(3);
    for (const call of convexMock.onUpdate.mock.calls) {
      expect(call[3]).toBe(onError);
    }
  });
});
