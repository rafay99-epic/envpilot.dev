import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  writeSessionMarker,
  clearSessionMarker,
  reapDeadSessionMarkers,
  getLiveSessionFolders,
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
      await writeSessionMarker(12345, ["/ws/a"], sessionsDir);
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

    it("reap removes dead-pid markers, returns their folders, keeps live ones", async () => {
      await writeSessionMarker(111, ["/ws/crashed"], sessionsDir);
      await writeSessionMarker(222, ["/ws/live"], sessionsDir);

      const result = await reapDeadSessionMarkers(
        sessionsDir,
        (pid) => pid === 222 // only 222 is "alive"
      );

      expect(result.crashed).toBe(true);
      expect(result.deadFolders).toEqual(["/ws/crashed"]);
      await expect(fs.access(path.join(sessionsDir, "111"))).rejects.toThrow();
      await expect(
        fs.access(path.join(sessionsDir, "222"))
      ).resolves.toBeUndefined();
    });

    it("reap reports no crash when every marker is alive", async () => {
      await writeSessionMarker(111, ["/ws/a"], sessionsDir);
      const result = await reapDeadSessionMarkers(sessionsDir, () => true);
      expect(result.crashed).toBe(false);
      expect(result.deadFolders).toEqual([]);
    });

    it("reap reports no crash when the sessions dir does not exist", async () => {
      const result = await reapDeadSessionMarkers(
        path.join(tmpDir, "missing"),
        () => true
      );
      expect(result.crashed).toBe(false);
    });

    it("reap IGNORES non-pid filenames (.DS_Store must not fake a crash)", async () => {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(path.join(sessionsDir, ".DS_Store"), "junk");
      const result = await reapDeadSessionMarkers(sessionsDir, () => true);
      expect(result.crashed).toBe(false);
      await expect(
        fs.access(path.join(sessionsDir, ".DS_Store"))
      ).resolves.toBeUndefined();
    });

    it("reap tolerates a legacy empty-content marker (no folders recorded)", async () => {
      await fs.mkdir(sessionsDir, { recursive: true });
      await fs.writeFile(path.join(sessionsDir, "333"), "");
      const result = await reapDeadSessionMarkers(sessionsDir, () => false);
      expect(result.crashed).toBe(true);
      expect(result.deadFolders).toEqual([]);
    });

    it("getLiveSessionFolders returns other live sessions' folders only", async () => {
      await writeSessionMarker(100, ["/ws/mine"], sessionsDir);
      await writeSessionMarker(200, ["/ws/other-live"], sessionsDir);
      await writeSessionMarker(300, ["/ws/other-dead"], sessionsDir);

      const folders = await getLiveSessionFolders(
        100,
        sessionsDir,
        (pid) => pid !== 300
      );

      expect(folders).toEqual(["/ws/other-live"]);
    });

    it("getLiveSessionFolders returns [] when the dir is missing", async () => {
      expect(
        await getLiveSessionFolders(1, path.join(tmpDir, "missing"), () => true)
      ).toEqual([]);
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
