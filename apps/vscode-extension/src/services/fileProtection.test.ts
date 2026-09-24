import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, statSync } from "fs";
import { tmpdir } from "os";
import * as path from "path";

const vscodeMock = vi.hoisted(() => {
  const handlers: Array<() => void> = [];
  const events: string[] = [];
  return {
    handlers,
    events,
    module: {
      workspace: {
        createFileSystemWatcher: () => ({
          onDidChange: (fn: () => void) => handlers.push(fn),
          onDidDelete: (fn: () => void) => handlers.push(fn),
          dispose: () => events.push("dispose"),
        }),
      },
      window: {
        showWarningMessage: () => {
          events.push("toast");
          return new Promise(() => {});
        },
      },
      commands: { executeCommand: vi.fn() },
    },
  };
});

vi.mock("vscode", () => vscodeMock.module);
vi.mock("../utils/managedFiles", () => ({
  getManifestPath: () => "/nonexistent",
  hashContent: () => "",
  readManifest: async () => [],
}));

import { FileProtectionService } from "./fileProtection";

describe("FileProtectionService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vscodeMock.handlers.length = 0;
    vscodeMock.events.length = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reverts before the toast, re-locks, and uses the latest callback", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "fp-")), ".env");
    writeFileSync(file, "A=1\n", { mode: 0o444 });
    const service = new FileProtectionService();
    const stale = vi.fn(async () => {});
    service.watchFile(file, stale);
    service.watchFile(file, async () => {
      vscodeMock.events.push("resync");
      expect(statSync(file).mode & 0o777).toBe(0o644);
    });

    vscodeMock.handlers[0]();
    await vi.waitFor(() =>
      expect(vscodeMock.events).toEqual(["resync", "toast"])
    );
    expect(stale).not.toHaveBeenCalled();
    expect(statSync(file).mode & 0o777).toBe(0o444);
  });

  it("stops watching once the mode becomes writable", () => {
    const service = new FileProtectionService();
    service.watchFile("/tmp/x/.env", async () => {});
    service.watchFile("/tmp/x/.env", async () => {}, "writable");
    expect(vscodeMock.events).toEqual(["dispose"]);
  });
});
