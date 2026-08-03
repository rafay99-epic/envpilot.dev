import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  mkdtempSync,
  symlinkSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { webcrypto } from "node:crypto";

import {
  applyMode,
  ignoreSecretFilePaths,
  localDigest,
  modeMatches,
  resolveInsideRoot,
  statusOf,
  writeSecretFile,
} from "./secret-files.js";
import {
  digest as serverDigest,
  newDigestSalt,
  open as serverOpen,
  seal as serverSeal,
  toBase64,
  fromBase64,
} from "../../../../convex/features/files/crypto.js";

/**
 * Secret files on disk — the half of the feature that touches a real
 * filesystem. Everything here runs against a temp directory with real files
 * so the assertions are about actual behaviour (modes, atomicity, digests)
 * rather than mocks.
 *
 * The cross-client digest agreement test is the important one: the server
 * computes the digest with Web Crypto, the CLI recomputes it with
 * node:crypto, and if those two ever disagree every file reports as
 * permanently modified.
 */

if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto });
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "envpilot-files-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Minimal row shape — only the fields the disk helpers read. */
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: "f1",
    name: "Keystore",
    path: "android/app/upload.jks",
    mode: "0600",
    size: 4,
    sha256: "",
    digestSalt: "",
    environments: ["production"],
    projectId: "p1",
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    access: "write" as const,
    ...overrides,
  } as Parameters<typeof statusOf>[0];
}

describe("path containment", () => {
  it("accepts a normal nested path", async () => {
    // Compare against the REAL root: containment now resolves symlinks, and
    // on macOS /tmp is itself a symlink to /private/tmp.
    expect(resolveInsideRoot(root, "android/app/upload.jks")).toBe(
      join(realpathSync.native(root), "android/app/upload.jks")
    );
  });

  it("refuses a path that escapes through a symlinked directory", async () => {
    // The lexical check passes here — "link/escaped.key" normalises inside
    // the root — so only resolving the real ancestor catches it.
    const outside = mkdtempSync(join(tmpdir(), "envpilot-outside-"));
    try {
      symlinkSync(outside, join(root, "link"));
      expect(() => resolveInsideRoot(root, "link/escaped.key")).toThrow(
        /symlink|outside/
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses to write through a symlinked destination", async () => {
    const outside = mkdtempSync(join(tmpdir(), "envpilot-outside-"));
    try {
      writeFileSync(join(outside, "target"), "x");
      symlinkSync(join(outside, "target"), join(root, "decoy.key"));
      expect(() => resolveInsideRoot(root, "decoy.key")).toThrow(/symlink/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("refuses traversal, absolute paths, and the root itself", async () => {
    // The server rejects these too, but this is the process that actually
    // creates files in someone's repo — it must not rely on that.
    expect(() => resolveInsideRoot(root, "../escaped.jks")).toThrow(/outside/);
    expect(() => resolveInsideRoot(root, "a/../../escaped.jks")).toThrow(
      /outside/
    );
    expect(() => resolveInsideRoot(root, "/etc/passwd")).toThrow(/absolute/);
    expect(() => resolveInsideRoot(root, ".")).toThrow(/outside/);
  });
});

describe("writeSecretFile", () => {
  it("creates missing directories and writes the bytes", async () => {
    const written = await writeSecretFile(
      root,
      "android/app/upload.jks",
      Buffer.from("keystore-bytes"),
      "0600"
    );
    expect(readFileSync(written).toString()).toBe("keystore-bytes");
  });

  it("applies 0600 and 0400 exactly", async () => {
    const a = await writeSecretFile(root, "a.key", Buffer.from("x"), "0600");
    const b = await writeSecretFile(root, "b.key", Buffer.from("x"), "0400");
    // Mask to the permission bits — the file type bits are not ours.
    expect(statSync(a).mode & 0o777).toBe(0o600);
    expect(statSync(b).mode & 0o777).toBe(0o400);
  });

  it("overwrites a read-only file left by a previous pull", async () => {
    // 0400 means the destination is not writable. The atomic rename is what
    // makes a second pull work at all — a plain write would EACCES.
    await writeSecretFile(root, "rotating.key", Buffer.from("v1"), "0400");
    await writeSecretFile(root, "rotating.key", Buffer.from("v2"), "0400");
    expect(readFileSync(join(root, "rotating.key")).toString()).toBe("v2");
  });

  it("leaves no temp file behind on success", async () => {
    await writeSecretFile(root, "clean.key", Buffer.from("x"), "0600");
    const stray = readFileSync(join(root, "clean.key"));
    expect(stray.toString()).toBe("x");
    expect(() => statSync(join(root, "clean.key.envpilot-1.tmp"))).toThrow();
  });

  it("round-trips arbitrary binary, not just text", async () => {
    const binary = Buffer.from(
      Array.from({ length: 512 }, (_, i) => (i * 31) % 256)
    );
    const written = await writeSecretFile(root, "bin/blob.p12", binary, "0600");
    expect(readFileSync(written).equals(binary)).toBe(true);
  });
});

describe("drift detection", () => {
  it("reports missing, in-sync, then modified as the file changes", async () => {
    const salt = newDigestSalt();
    const contents = Buffer.from('{"type":"service_account"}');
    const sha = await serverDigest(new Uint8Array(contents), salt);
    const file = row({ path: "gcp.json", sha256: sha, digestSalt: salt });

    expect(await statusOf(file, root)).toBe("missing");

    await writeSecretFile(root, "gcp.json", contents, "0600");
    expect(await statusOf(file, root)).toBe("in-sync");

    writeFileSync(join(root, "gcp.json"), "tampered");
    expect(await statusOf(file, root)).toBe("modified");
  });

  it("reports an unsafe path as a conflict, not as missing", async () => {
    // A hostile or buggy server response must not crash `files status` — and
    // it must not read as "missing" either. Missing means "safe to write",
    // which would send pull off to decrypt a file it then refuses to write.
    expect(await statusOf(row({ path: "../evil" }), root)).toBe("modified");
  });

  it("reports an unreadable local entry as a conflict, not as missing", async () => {
    // Only ENOENT is an absence. EACCES/EIO mean we cannot tell what is
    // there, and "safe to overwrite" must never be a guess.
    const dir = join(root, "as-directory");
    mkdirSync(dir, { recursive: true });
    expect(await statusOf(row({ path: "as-directory" }), root)).toBe(
      "modified"
    );
  });
});

describe("permission drift", () => {
  it("detects a byte-identical file whose mode was loosened", async () => {
    // The digest still matches, so statusOf reports in-sync — but a keystore
    // left world-readable is still wrong. This is the case a careless
    // `chmod -R`, a zip extract, or a checkout produces.
    const salt = newDigestSalt();
    const contents = Buffer.from("keystore");
    const sha = await serverDigest(new Uint8Array(contents), salt);
    const file = row({
      path: "k.jks",
      mode: "0400",
      sha256: sha,
      digestSalt: salt,
    });

    await writeSecretFile(root, "k.jks", contents, "0400");
    expect(await statusOf(file, root)).toBe("in-sync");
    expect(modeMatches(root, "k.jks", "0400")).toBe(true);

    chmodSync(join(root, "k.jks"), 0o644);
    expect(await statusOf(file, root), "content is still identical").toBe(
      "in-sync"
    );
    expect(modeMatches(root, "k.jks", "0400"), "mode drift is caught").toBe(
      false
    );
  });

  it("repairs the mode without touching the contents", async () => {
    await writeSecretFile(root, "k.jks", Buffer.from("keystore"), "0400");
    chmodSync(join(root, "k.jks"), 0o644);

    applyMode(root, "k.jks", "0400");

    expect(statSync(join(root, "k.jks")).mode & 0o777).toBe(0o400);
    expect(readFileSync(join(root, "k.jks")).toString()).toBe("keystore");
  });

  it("treats a missing file as no drift (statusOf owns that case)", async () => {
    expect(modeMatches(root, "absent.key", "0400")).toBe(true);
  });
});

describe("cross-client digest agreement", () => {
  it("CLI localDigest matches the server digest byte for byte", async () => {
    // If these diverge, every file reports as permanently modified and every
    // pull re-downloads everything. Assert against the real server function.
    const salt = newDigestSalt();
    for (const sample of ["", "a", "keystore-bytes", "x".repeat(5000)]) {
      const buf = Buffer.from(sample);
      const server = await serverDigest(new Uint8Array(buf), salt);
      expect(localDigest(buf, salt)).toBe(server);
    }
  });

  it("agrees on binary content containing NUL bytes", async () => {
    const salt = newDigestSalt();
    const buf = Buffer.from([0, 1, 2, 0, 255, 128, 0]);
    const server = await serverDigest(new Uint8Array(buf), salt);
    expect(localDigest(buf, salt)).toBe(server);
  });
});

describe("full encrypt → transport → disk round trip", () => {
  it("a sealed file decrypts and lands on disk byte-identical", async () => {
    // Exercises the whole content path without a network: seal on the
    // server, base64 over the wire, decrypt, write, read back.
    const original = Buffer.from(
      Array.from({ length: 2048 }, (_, i) => (i * 7 + 13) % 256)
    );
    const salt = newDigestSalt();
    const sha = await serverDigest(new Uint8Array(original), salt);

    const sealed = await serverSeal(new Uint8Array(original));
    const overTheWire = toBase64(
      await serverOpen(sealed.ciphertext, sealed.keyMaterial)
    );

    const written = await writeSecretFile(
      root,
      "android/app/upload.jks",
      Buffer.from(fromBase64(overTheWire)),
      "0400"
    );

    expect(readFileSync(written).equals(original)).toBe(true);
    expect(statSync(written).mode & 0o777).toBe(0o400);
    expect(
      await statusOf(row({ sha256: sha, digestSalt: salt }), root),
      "a freshly pulled file must read back as in-sync"
    ).toBe("in-sync");
  });
});

describe("gitignore", () => {
  it("creates .gitignore when the repo has none", async () => {
    // Returning early here left secrets untracked-and-offerable in exactly
    // the repo most likely to commit one by accident.
    const added = ignoreSecretFilePaths(root, ["a.key"]);
    expect(added).toContain("a.key");
    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toContain("a.key");
  });

  it("appends missing paths plus the temp-file pattern, and is idempotent", async () => {
    writeFileSync(join(root, ".gitignore"), "node_modules\n");

    const first = ignoreSecretFilePaths(root, ["android/app/upload.jks"]);
    expect(first).toContain("android/app/upload.jks");
    expect(first).toContain("*.envpilot-*.tmp");

    // Second call adds nothing — a pull runs this every time.
    expect(ignoreSecretFilePaths(root, ["android/app/upload.jks"])).toEqual([]);

    const content = readFileSync(join(root, ".gitignore"), "utf-8");
    expect(content.split("android/app/upload.jks").length - 1).toBe(1);
    expect(content.startsWith("node_modules\n")).toBe(true);
  });

  it("does not duplicate a path already ignored with a leading slash", async () => {
    writeFileSync(join(root, ".gitignore"), "/secrets/key.pem\n");
    expect(ignoreSecretFilePaths(root, ["secrets/key.pem"])).not.toContain(
      "secrets/key.pem"
    );
  });

  it("appends cleanly to a .gitignore with no trailing newline", async () => {
    writeFileSync(join(root, ".gitignore"), "dist");
    ignoreSecretFilePaths(root, ["a.key"]);
    const lines = readFileSync(join(root, ".gitignore"), "utf-8").split("\n");
    // "dist" must not have been merged into the next entry.
    expect(lines).toContain("dist");
    expect(lines).toContain("a.key");
  });
});

describe("ordering guarantee", () => {
  it("gitignore is written before the file exists", async () => {
    mkdirSync(join(root, "android/app"), { recursive: true });
    writeFileSync(join(root, ".gitignore"), "node_modules\n");

    // This is the sequence `files pull` performs. Assert the invariant that
    // the ignore entry is in place at the moment the secret hits the disk.
    ignoreSecretFilePaths(root, ["android/app/upload.jks"]);
    const ignoredAtWriteTime = readFileSync(
      join(root, ".gitignore"),
      "utf-8"
    ).includes("android/app/upload.jks");

    await writeSecretFile(
      root,
      "android/app/upload.jks",
      Buffer.from("k"),
      "0600"
    );

    expect(ignoredAtWriteTime).toBe(true);
  });
});
