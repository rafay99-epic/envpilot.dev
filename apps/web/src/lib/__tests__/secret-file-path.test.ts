import { describe, it, expect } from "vitest";
import { normalizeFilePath } from "@convex/features/files/helpers";

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

  it("refuses tooling directories at any depth and env files", () => {
    for (const bad of [
      ".husky/pre-commit",
      "packages/api/.git/hooks/post-checkout",
      "apps/web/.HUSKY/pre-push",
      ".idea/workspace.xml",
      "tools/.vscode/tasks.json",
      "nested/.envpilot/config.json",
      ".env",
      "apps/web/.env.local",
      "config/production.ENV",
    ]) {
      expect(() => normalizeFilePath(bad)).toThrow();
    }
    expect(normalizeFilePath("config/environment.json")).toBe(
      "config/environment.json"
    );
  });

  it("refuses segments ending in a space or a period", () => {
    for (const bad of [
      ".. /outside.pem",
      ".git./config",
      "certs /server.pem",
      "certs/server.pem.",
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
