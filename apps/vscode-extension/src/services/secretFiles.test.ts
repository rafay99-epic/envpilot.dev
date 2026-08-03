import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  materialiseSecretFiles,
  modeMatches,
  type WrittenSecretFile,
} from "./secretFiles";
import type { ApiService, SecretFileRow } from "./api";

/**
 * The guards a synced secret file must carry are registered through the
 * `onWritten` callback. The regression these tests exist for: registration
 * used to fire only for files this run actually WROTE, so every sync after
 * the first — and every window reload — left a decrypted secret in the
 * workspace with no clipboard guard and no edit protection.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "envpilot-ext-files-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** sha256(salt || plaintext) in base64 — the server's digest construction. */
async function digestOf(contents: Buffer, salt: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from(salt, "base64"), contents]))
    .digest("base64");
}

function row(over: Partial<SecretFileRow> = {}): SecretFileRow {
  return {
    _id: "f1",
    name: "Keystore",
    path: "android/app/upload.jks",
    mode: "0400",
    size: 8,
    sha256: "",
    digestSalt: Buffer.from("0123456789abcdef").toString("base64"),
    environments: ["development"],
    projectId: "p1",
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    access: "read",
    ...over,
  } as SecretFileRow;
}

function fakeApi(files: SecretFileRow[], content: string): ApiService {
  return {
    listSecretFiles: async () => files,
    getSecretFileContent: async () => ({
      name: files[0].name,
      path: files[0].path,
      mode: files[0].mode,
      size: content.length,
      sha256: files[0].sha256,
      content: Buffer.from(content).toString("base64"),
    }),
  } as unknown as ApiService;
}

describe("guard registration", () => {
  it("registers a file it just wrote", async () => {
    const file = row();
    const registered: WrittenSecretFile[] = [];

    const result = await materialiseSecretFiles(
      fakeApi([file], "keystore"),
      "p1",
      "development",
      root,
      { onWritten: async (f) => void registered.push(f) }
    );

    expect(result.written).toEqual(["android/app/upload.jks"]);
    expect(registered.map((r) => r.path)).toEqual(["android/app/upload.jks"]);
    expect(registered[0].numericMode).toBe(0o400);
  });

  it("registers a file that is ALREADY in sync", async () => {
    // The regression: a second sync writes nothing, and used to return before
    // attaching any guard — leaving the secret copyable.
    const contents = Buffer.from("keystore");
    const salt = Buffer.from("0123456789abcdef").toString("base64");
    const file = row({ sha256: await digestOf(contents, salt) });
    const api = fakeApi([file], "keystore");

    await materialiseSecretFiles(api, "p1", "development", root, {});

    const registered: WrittenSecretFile[] = [];
    const second = await materialiseSecretFiles(
      api,
      "p1",
      "development",
      root,
      {
        onWritten: async (f) => void registered.push(f),
      }
    );

    expect(second.written, "nothing re-downloaded").toEqual([]);
    expect(second.unchanged).toEqual(["android/app/upload.jks"]);
    expect(
      registered.map((r) => r.path),
      "an in-sync file must still be guarded"
    ).toEqual(["android/app/upload.jks"]);
  });

  it("registers a locally-modified file it refused to overwrite", async () => {
    // A conflicted file is still a secret sitting in the workspace.
    const file = row({ sha256: "does-not-match" });
    writeFileSync(join(root, "local.key"), "tampered");
    const modified = row({ path: "local.key", sha256: "does-not-match" });

    const registered: WrittenSecretFile[] = [];
    const result = await materialiseSecretFiles(
      fakeApi([modified], "server"),
      "p1",
      "development",
      root,
      { onWritten: async (f) => void registered.push(f) }
    );

    expect(result.conflicts).toEqual(["local.key"]);
    expect(registered.map((r) => r.path)).toEqual(["local.key"]);
    void file;
  });

  it("passes the file's own permission bits, never 0444", async () => {
    const registered: WrittenSecretFile[] = [];
    await materialiseSecretFiles(
      fakeApi([row({ mode: "0400" })], "k"),
      "p1",
      "development",
      root,
      { onWritten: async (f) => void registered.push(f) }
    );
    // 0444 would be world-readable — looser than what the file was pulled at.
    expect(registered[0].numericMode).toBe(0o400);
    expect(registered[0].numericMode).not.toBe(0o444);
  });

  it("brackets its writes with setSyncing so the watcher does not self-trip", async () => {
    const calls: boolean[] = [];
    await materialiseSecretFiles(
      fakeApi([row()], "keystore"),
      "p1",
      "development",
      root,
      { setSyncing: (v) => calls.push(v) }
    );
    expect(calls).toEqual([true, false]);
  });

  it("repairs loosened permissions on an in-sync file", async () => {
    const contents = Buffer.from("keystore");
    const salt = Buffer.from("0123456789abcdef").toString("base64");
    const file = row({ sha256: await digestOf(contents, salt) });
    const api = fakeApi([file], "keystore");

    await materialiseSecretFiles(api, "p1", "development", root, {});
    const target = join(root, "android/app/upload.jks");
    chmodSync(target, 0o644);
    expect(modeMatches(root, "android/app/upload.jks", "0400")).toBe(false);

    await materialiseSecretFiles(api, "p1", "development", root, {});

    expect(statSync(target).mode & 0o777).toBe(0o400);
    expect(readFileSync(target).toString()).toBe("keystore");
  });
});
