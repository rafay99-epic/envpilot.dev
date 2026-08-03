import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  forgetManagedFile,
  hashContent,
  purgeManagedFiles,
  purgeManagedFilesFiltered,
  readManifest,
  recordManagedFile,
  releaseManagedFile,
} from "./managedFiles";

describe("managedFiles", () => {
  let tmpDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envpilot-managed-"));
    manifestPath = path.join(tmpDir, "manifest.json");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("recordManagedFile", () => {
    it("creates manifest with resolved path + sha256 of content", async () => {
      const filePath = path.join(tmpDir, "test.env");
      const content = "SECRET_KEY=abc123";
      await fs.writeFile(filePath, content);

      await recordManagedFile(filePath, content, manifestPath);

      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe(path.resolve(filePath));
      expect(entries[0].sha256).toBe(hashContent(content));

      const raw = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
    });

    it("upserts same path twice (one entry, latest hash)", async () => {
      const filePath = path.join(tmpDir, "test.env");
      const content1 = "SECRET_KEY=abc123";
      const content2 = "SECRET_KEY=xyz789";
      await fs.writeFile(filePath, content1);

      await recordManagedFile(filePath, content1, manifestPath);
      await recordManagedFile(filePath, content2, manifestPath);

      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe(path.resolve(filePath));
      expect(entries[0].sha256).toBe(hashContent(content2));
    });
  });

  describe("forgetManagedFile", () => {
    it("removes the entry", async () => {
      const filePath = path.join(tmpDir, "test.env");
      const content = "SECRET_KEY=abc123";
      await fs.writeFile(filePath, content);

      await recordManagedFile(filePath, content, manifestPath);
      let entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(1);

      await forgetManagedFile(filePath, manifestPath);
      entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(0);
    });

    it("is a no-op when entry absent", async () => {
      const filePath = path.join(tmpDir, "nonexistent.env");

      await forgetManagedFile(filePath, manifestPath);

      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(0);
    });
  });

  describe("readManifest", () => {
    it("returns [] for a missing manifest", async () => {
      const entries = await readManifest(
        path.join(tmpDir, "does-not-exist.json")
      );
      expect(entries).toEqual([]);
    });

    it("returns [] for a corrupt-JSON manifest", async () => {
      await fs.mkdir(path.dirname(manifestPath), { recursive: true });
      await fs.writeFile(manifestPath, "not valid json{{{");

      const entries = await readManifest(manifestPath);
      expect(entries).toEqual([]);
    });
  });

  describe("purgeManagedFiles", () => {
    it("deletes file whose content matches recorded hash, spares modified file", async () => {
      const file1 = path.join(tmpDir, "synced.env");
      const file2 = path.join(tmpDir, "edited.env");
      const content1 = "KEY=value1";
      const content2 = "KEY=value2";
      await fs.writeFile(file1, content1);
      await fs.writeFile(file2, content2);

      await recordManagedFile(file1, content1, manifestPath);
      await recordManagedFile(file2, content2, manifestPath);

      // Edit file2 so hash no longer matches.
      await fs.writeFile(file2, "KEY=modified");

      const result = await purgeManagedFiles(manifestPath);
      expect(result.deleted).toBe(1);
      expect(result.spared).toBe(1);

      // file1 should be gone, file2 should remain.
      await expect(fs.access(file1)).rejects.toThrow();
      await expect(fs.access(file2)).resolves.toBeUndefined();
    });

    it("skips already-deleted files without error", async () => {
      const filePath = path.join(tmpDir, "ghost.env");
      const content = "KEY=value";
      await fs.writeFile(filePath, content);

      await recordManagedFile(filePath, content, manifestPath);

      // Delete the file manually before purging.
      await fs.unlink(filePath);

      const result = await purgeManagedFiles(manifestPath);
      expect(result.deleted).toBe(0);
      expect(result.spared).toBe(0);
    });

    it("purges a chmod-0o444 read-only file", async () => {
      const filePath = path.join(tmpDir, "readonly.env");
      const content = "KEY=secret";
      await fs.writeFile(filePath, content);
      await fs.chmod(filePath, 0o444);

      await recordManagedFile(filePath, content, manifestPath);

      // Verify it's read-only before purge.
      const statBefore = await fs.stat(filePath);
      expect(statBefore.mode & 0o222).toBe(0);

      const result = await purgeManagedFiles(manifestPath);
      expect(result.deleted).toBe(1);
      expect(result.spared).toBe(0);

      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("removes the manifest itself after purging", async () => {
      const filePath = path.join(tmpDir, "test.env");
      const content = "KEY=value";
      await fs.writeFile(filePath, content);

      await recordManagedFile(filePath, content, manifestPath);
      await expect(fs.access(manifestPath)).resolves.toBeUndefined();

      await purgeManagedFiles(manifestPath);
      await expect(fs.access(manifestPath)).rejects.toThrow();
    });

    it("returns {deleted:0, spared:0} for a missing manifest", async () => {
      const result = await purgeManagedFiles(
        path.join(tmpDir, "no-manifest.json")
      );
      expect(result).toEqual({ deleted: 0, spared: 0 });
    });
  });

  describe("purgeManagedFilesFiltered", () => {
    it("deletes only files selected by the filter, keeps the rest listed", async () => {
      const inScope = path.join(tmpDir, "workspace", "a.env");
      const outOfScope = path.join(tmpDir, "elsewhere", "b.env");
      await fs.mkdir(path.dirname(inScope), { recursive: true });
      await fs.mkdir(path.dirname(outOfScope), { recursive: true });
      const content = "KEY=value";
      await fs.writeFile(inScope, content);
      await fs.writeFile(outOfScope, content);
      await recordManagedFile(inScope, content, manifestPath);
      await recordManagedFile(outOfScope, content, manifestPath);

      const result = await purgeManagedFilesFiltered(
        (p) => p.startsWith(path.join(tmpDir, "workspace") + path.sep),
        manifestPath
      );

      expect(result).toEqual({ deleted: 1, spared: 0, failed: 0 });
      await expect(fs.access(inScope)).rejects.toThrow();
      await expect(fs.access(outOfScope)).resolves.toBeUndefined();

      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(1);
      expect(entries[0].path).toBe(path.resolve(outOfScope));
    });

    it("spares hand-edited files and keeps their manifest entries", async () => {
      const filePath = path.join(tmpDir, "edited.env");
      const content = "KEY=original";
      await fs.writeFile(filePath, content);
      await recordManagedFile(filePath, content, manifestPath);
      await fs.writeFile(filePath, "KEY=hand-edited");

      const result = await purgeManagedFilesFiltered(() => true, manifestPath);

      expect(result).toEqual({ deleted: 0, spared: 1, failed: 0 });
      await expect(fs.access(filePath)).resolves.toBeUndefined();
      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(1);
    });

    it("keeps the manifest file itself (unlike purgeManagedFiles)", async () => {
      const filePath = path.join(tmpDir, "synced.env");
      const content = "KEY=value";
      await fs.writeFile(filePath, content);
      await recordManagedFile(filePath, content, manifestPath);

      await purgeManagedFilesFiltered(() => true, manifestPath);

      await expect(fs.access(manifestPath)).resolves.toBeUndefined();
      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(0);
    });

    it("drops stale entries for files already deleted from disk", async () => {
      const filePath = path.join(tmpDir, "ghost.env");
      const content = "KEY=value";
      await fs.writeFile(filePath, content);
      await recordManagedFile(filePath, content, manifestPath);
      await fs.unlink(filePath);

      const result = await purgeManagedFilesFiltered(() => true, manifestPath);

      expect(result).toEqual({ deleted: 0, spared: 0, failed: 0 });
      const entries = await readManifest(manifestPath);
      expect(entries).toHaveLength(0);
    });

    it("purges read-only (0o444) files", async () => {
      const filePath = path.join(tmpDir, "readonly.env");
      const content = "KEY=secret";
      await fs.writeFile(filePath, content);
      await fs.chmod(filePath, 0o444);
      await recordManagedFile(filePath, content, manifestPath);

      const result = await purgeManagedFilesFiltered(() => true, manifestPath);

      expect(result.deleted).toBe(1);
      await expect(fs.access(filePath)).rejects.toThrow();
    });

    it("returns zeros for a missing manifest", async () => {
      const result = await purgeManagedFilesFiltered(
        () => true,
        path.join(tmpDir, "no-manifest.json")
      );
      expect(result).toEqual({ deleted: 0, spared: 0, failed: 0 });
    });
  });
});

describe("multi-project ownership", () => {
  let dir: string;
  let manifest: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "envpilot-owners-"));
    manifest = path.join(dir, "manifest.json");
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("keeps the file when another linked project still owns the path", async () => {
    // Two projects linked to the same directory publishing the same relative
    // path. Unlinking one must not delete a file the other is still using.
    const file = path.join(dir, "shared.pem");
    await fs.writeFile(file, "key-bytes");

    await recordManagedFile(
      file,
      "key-bytes",
      manifest,
      "strict-readonly",
      "proj-a"
    );
    await recordManagedFile(
      file,
      "key-bytes",
      manifest,
      "strict-readonly",
      "proj-b"
    );

    expect(await releaseManagedFile(file, "proj-a", manifest)).toBe(false);
    const afterFirst = await readManifest(manifest);
    expect(afterFirst[0].projectIds).toEqual(["proj-b"]);

    expect(await releaseManagedFile(file, "proj-b", manifest)).toBe(true);
    expect(await readManifest(manifest)).toHaveLength(0);
  });

  it("reports an unowned legacy entry as safe to delete", async () => {
    const file = path.join(dir, "legacy.pem");
    await fs.writeFile(file, "x");
    await recordManagedFile(file, "x", manifest);
    expect(await releaseManagedFile(file, "proj-a", manifest)).toBe(true);
  });

  it("migrates the single-owner shape written by earlier builds", async () => {
    const file = path.join(dir, "old.pem");
    await fs.writeFile(
      manifest,
      JSON.stringify([{ path: file, sha256: "abc", projectId: "proj-a" }])
    );
    const entries = await readManifest(manifest);
    expect(entries[0].projectIds).toEqual(["proj-a"]);
  });
});
