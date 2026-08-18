import { describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EnvpilotApiError, type EnvpilotFile } from "./api.js";
import {
  batchByTotalSize,
  withRateLimitRetry,
  writeSecretFile,
} from "./files.js";

function file(
  overrides: Partial<EnvpilotFile> & { path: string }
): EnvpilotFile {
  return {
    name: overrides.path,
    mode: "0600",
    size: 4,
    sha256: "x",
    content: Buffer.from("data").toString("base64"),
    ...overrides,
  };
}

function root(): string {
  return mkdtempSync(join(tmpdir(), "envpilot-files-"));
}

describe("batchByTotalSize", () => {
  it("packs files under the budget", () => {
    const batches = batchByTotalSize(
      [
        file({ path: "a", size: 4 }),
        file({ path: "b", size: 4 }),
        file({ path: "c", size: 4 }),
      ],
      8
    );
    expect(batches.map((b) => b.map((f) => f.path))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("gives an oversized file its own batch instead of dropping it", () => {
    const batches = batchByTotalSize(
      [file({ path: "small", size: 1 }), file({ path: "huge", size: 999 })],
      8
    );
    expect(batches).toHaveLength(2);
    expect(batches[1]![0]!.path).toBe("huge");
  });

  it("returns nothing for no files", () => {
    expect(batchByTotalSize([], 8)).toEqual([]);
  });
});

describe("withRateLimitRetry", () => {
  it("waits the cooldown the server asked for, then succeeds", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withRateLimitRetry(
      "test",
      () => {
        calls += 1;
        if (calls === 1) throw new EnvpilotApiError("slow down", 429, 3);
        return Promise.resolve("ok");
      },
      (ms) => {
        waits.push(ms);
        return Promise.resolve();
      }
    );
    expect(result).toBe("ok");
    expect(waits).toEqual([3000]);
  });

  it("caps a hostile Retry-After at 60s", async () => {
    const waits: number[] = [];
    let calls = 0;
    await withRateLimitRetry(
      "test",
      () => {
        calls += 1;
        if (calls === 1) throw new EnvpilotApiError("slow down", 429, 99999);
        return Promise.resolve("ok");
      },
      (ms) => {
        waits.push(ms);
        return Promise.resolve();
      }
    );
    expect(waits).toEqual([60_000]);
  });

  it("does not retry a non-429", async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry("test", () => {
        calls += 1;
        return Promise.reject(new EnvpilotApiError("denied", 403));
      })
    ).rejects.toThrow("denied");
    expect(calls).toBe(1);
  });

  it("gives up eventually so a wedged limiter cannot hang a build", async () => {
    let calls = 0;
    await expect(
      withRateLimitRetry(
        "test",
        () => {
          calls += 1;
          return Promise.reject(new EnvpilotApiError("slow down", 429, 1));
        },
        () => Promise.resolve()
      )
    ).rejects.toThrow("slow down");
    expect(calls).toBe(5);
  });
});

describe("writeSecretFile", () => {
  it("writes at 0600 and creates parent directories", () => {
    const dir = root();
    writeSecretFile(dir, file({ path: "nested/deep/key.pem" }));
    const written = join(dir, "nested/deep/key.pem");
    expect(readFileSync(written, "utf-8")).toBe("data");
    expect(statSync(written).mode & 0o777).toBe(0o600);
  });

  it("honors mode 0400", () => {
    const dir = root();
    writeSecretFile(dir, file({ path: "ro.pem", mode: "0400" }));
    expect(statSync(join(dir, "ro.pem")).mode & 0o777).toBe(0o400);
  });

  it("replaces an existing world-readable file at the restrictive mode", () => {
    const dir = root();
    writeSecretFile(dir, file({ path: "k.pem" }));
    writeSecretFile(
      dir,
      file({ path: "k.pem", content: Buffer.from("new").toString("base64") })
    );
    expect(readFileSync(join(dir, "k.pem"), "utf-8")).toBe("new");
    expect(statSync(join(dir, "k.pem")).mode & 0o777).toBe(0o600);
  });

  it("refuses an absolute path", () => {
    expect(() =>
      writeSecretFile(root(), file({ path: "/etc/passwd" }))
    ).toThrow(/absolute path/);
  });

  it("refuses traversal out of the output directory", () => {
    expect(() =>
      writeSecretFile(root(), file({ path: "../../escaped" }))
    ).toThrow(/outside the output directory/);
  });

  it("refuses a path that escapes through a symlinked directory", () => {
    const dir = root();
    const outside = root();
    mkdirSync(join(dir, "holder"), { recursive: true });
    symlinkSync(outside, join(dir, "holder", "link"));
    expect(() =>
      writeSecretFile(dir, file({ path: "holder/link/key.pem" }))
    ).toThrow(/escapes through a symlink/);
  });

  it("refuses a metadata-only row rather than truncating a real file", () => {
    expect(() =>
      writeSecretFile(root(), file({ path: "k.pem", content: undefined }))
    ).toThrow(/no content/);
  });
});
