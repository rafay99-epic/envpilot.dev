import { describe, it, expect } from "vitest";
import { normalizeFilePath } from "@convex/features/files/helpers";

/**
 * Destination-path validation is the trust boundary for secret files: the
 * value travels from an upload form to `writeFileSync` on a developer's
 * machine and in CI. Everything rejected here is something a pull would
 * otherwise write.
 */
describe("normalizeFilePath", () => {
  it("canonicalizes without resolving anything away", () => {
    expect(normalizeFilePath("./android//app/upload.jks")).toBe(
      "android/app/upload.jks"
    );
    expect(normalizeFilePath("  certs/server.pem  ")).toBe("certs/server.pem");
  });

  it("refuses escapes rather than collapsing them", () => {
    for (const bad of [
      "../outside.pem",
      "a/../../etc/passwd",
      "/etc/passwd",
      "~/.ssh/id_rsa",
      "C:/keys/id_rsa",
      "keys\\id_rsa",
      "keys/id\0rsa",
    ]) {
      expect(() => normalizeFilePath(bad)).toThrow();
    }
  });

  it("refuses reserved paths in ANY case", () => {
    // macOS/Windows filesystems are case-insensitive: ".GIT/config" and
    // ".git/config" are the same file, so a case-sensitive check let a
    // secret file overwrite git's config on exactly the platforms most
    // developers use.
    for (const bad of [
      ".git",
      ".GIT/config",
      ".Git/hooks/pre-commit",
      ".gitignore",
      ".GitIgnore",
      ".envpilot",
      ".ENVPILOT/config.json",
    ]) {
      expect(() => normalizeFilePath(bad)).toThrow();
    }
  });

  it("allows ordinary paths that merely start with a dot", () => {
    expect(normalizeFilePath(".config/gcloud/key.json")).toBe(
      ".config/gcloud/key.json"
    );
    expect(normalizeFilePath(".gitlab/ci-key.pem")).toBe(".gitlab/ci-key.pem");
  });
});
