import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  writeSessionMarker,
  clearSessionMarker,
  reapDeadSessionMarkers,
  appendUnsyncReport,
  drainUnsyncReports,
  type UnsyncReport,
} from "./unsyncState";

describe("unsyncState", () => {
  let tmpDir: string;
  let sessionsDir: string;
  let reportsPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envpilot-unsync-"));
    sessionsDir = path.join(tmpDir, "sessions");
    reportsPath = path.join(tmpDir, "reports.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("session markers", () => {
    it("write + clear round-trips", async () => {
      await writeSessionMarker(12345, sessionsDir);
      await expect(
        fs.access(path.join(sessionsDir, "12345"))
      ).resolves.toBeUndefined();

      await clearSessionMarker(12345, sessionsDir);
      await expect(
        fs.access(path.join(sessionsDir, "12345"))
      ).rejects.toThrow();
    });

    it("clear is a no-op when the marker is absent", async () => {
      await expect(
        clearSessionMarker(99999, sessionsDir)
      ).resolves.toBeUndefined();
    });

    it("reap detects and removes dead-pid markers, keeps live ones", async () => {
      await writeSessionMarker(111, sessionsDir);
      await writeSessionMarker(222, sessionsDir);

      const crashed = await reapDeadSessionMarkers(
        sessionsDir,
        (pid) => pid === 222 // only 222 is "alive"
      );

      expect(crashed).toBe(true);
      await expect(fs.access(path.join(sessionsDir, "111"))).rejects.toThrow();
      await expect(
        fs.access(path.join(sessionsDir, "222"))
      ).resolves.toBeUndefined();
    });

    it("reap returns false when every marker is alive", async () => {
      await writeSessionMarker(111, sessionsDir);
      const crashed = await reapDeadSessionMarkers(sessionsDir, () => true);
      expect(crashed).toBe(false);
    });

    it("reap returns false when the sessions dir does not exist", async () => {
      const crashed = await reapDeadSessionMarkers(
        path.join(tmpDir, "missing"),
        () => true
      );
      expect(crashed).toBe(false);
    });

    it("reap removes garbage (non-pid) marker names", async () => {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(path.join(sessionsDir, "not-a-pid"), "");
      const crashed = await reapDeadSessionMarkers(sessionsDir, () => true);
      expect(crashed).toBe(true);
      await expect(
        fs.access(path.join(sessionsDir, "not-a-pid"))
      ).rejects.toThrow();
    });
  });

  describe("unsync reports", () => {
    const report = (overrides: Partial<UnsyncReport> = {}): UnsyncReport => ({
      projectId: "proj_1",
      deletedCount: 2,
      sparedCount: 1,
      trigger: "close",
      occurredAt: 1700000000000,
      ...overrides,
    });

    it("append + drain round-trips and empties the queue", async () => {
      await appendUnsyncReport(report(), reportsPath);
      await appendUnsyncReport(
        report({ projectId: "proj_2", trigger: "crash-sweep" }),
        reportsPath
      );

      const drained = await drainUnsyncReports(reportsPath);
      expect(drained).toHaveLength(2);
      expect(drained[0].projectId).toBe("proj_1");
      expect(drained[1].trigger).toBe("crash-sweep");

      expect(await drainUnsyncReports(reportsPath)).toEqual([]);
    });

    it("drain returns [] for a missing file", async () => {
      expect(await drainUnsyncReports(reportsPath)).toEqual([]);
    });

    it("drain filters malformed entries and tolerates corrupt JSON", async () => {
      await fs.writeFile(
        reportsPath,
        JSON.stringify([report(), { junk: true }, "nope"])
      );
      expect(await drainUnsyncReports(reportsPath)).toHaveLength(1);

      await fs.writeFile(reportsPath, "corrupt{{{");
      expect(await drainUnsyncReports(reportsPath)).toEqual([]);
    });
  });
});
