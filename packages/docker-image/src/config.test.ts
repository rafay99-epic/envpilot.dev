import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigError, DEFAULT_API_URL, resolveConfig } from "./config.js";

const BASE = {
  ENVPILOT_PROJECT: "checkout",
  ENVPILOT_ENVIRONMENT: "production",
};

function tokenFile(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "envpilot-")), "token");
  writeFileSync(path, contents);
  return path;
}

describe("resolveConfig", () => {
  it("prefers the mounted token file over the inline variable", () => {
    const config = resolveConfig(
      {},
      {
        ...BASE,
        ENVPILOT_TOKEN: "envpk_inline",
        ENVPILOT_TOKEN_FILE: tokenFile("envpk_mounted"),
      }
    );
    expect(config.token).toBe("envpk_mounted");
  });

  it("trims the trailing newline a mounted secret almost always carries", () => {
    const config = resolveConfig(
      {},
      { ...BASE, ENVPILOT_TOKEN_FILE: tokenFile("envpk_mounted\n") }
    );
    expect(config.token).toBe("envpk_mounted");
  });

  it("refuses an empty token file rather than sending an empty bearer", () => {
    expect(() =>
      resolveConfig({}, { ...BASE, ENVPILOT_TOKEN_FILE: tokenFile("  \n") })
    ).toThrow(ConfigError);
  });

  it("refuses an unreadable token file without leaking its contents", () => {
    expect(() =>
      resolveConfig({}, { ...BASE, ENVPILOT_TOKEN_FILE: "/nope/missing" })
    ).toThrow(/could not be read/);
  });

  it("requires a credential", () => {
    expect(() => resolveConfig({}, { ...BASE })).toThrow(/No API key/);
  });

  it("lets flags win over the environment so one image serves many envs", () => {
    const config = resolveConfig(
      { project: "billing", env: "staging" },
      { ...BASE, ENVPILOT_TOKEN: "envpk_x" }
    );
    expect(config.project).toBe("billing");
    expect(config.environment).toBe("staging");
  });

  it("defaults the API url and strips a trailing slash", () => {
    expect(resolveConfig({}, { ...BASE, ENVPILOT_TOKEN: "t" }).apiUrl).toBe(
      DEFAULT_API_URL
    );
    expect(
      resolveConfig(
        { apiUrl: "https://envpilot.internal/" },
        { ...BASE, ENVPILOT_TOKEN: "t" }
      ).apiUrl
    ).toBe("https://envpilot.internal");
  });

  it("names the missing input", () => {
    expect(() =>
      resolveConfig({}, { ENVPILOT_TOKEN: "t", ENVPILOT_ENVIRONMENT: "prod" })
    ).toThrow(/No project/);
    expect(() =>
      resolveConfig({}, { ENVPILOT_TOKEN: "t", ENVPILOT_PROJECT: "checkout" })
    ).toThrow(/No environment/);
  });
});
