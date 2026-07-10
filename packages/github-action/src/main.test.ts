import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as core from "@actions/core";
import { buildDotenvContent, escapeSingleQuoted } from "./dotenv.js";
import { run } from "./main.js";

describe("dotenv serialization", () => {
  it("single-quotes plain values", () => {
    expect(buildDotenvContent([{ key: "API_KEY", value: "abc123" }])).toBe(
      "API_KEY='abc123'\n"
    );
  });

  it("escapes embedded single quotes", () => {
    expect(escapeSingleQuoted(`it's a "test"`)).toBe(`it'\\''s a "test"`);
  });

  it("leaves shell metacharacters inert inside single quotes", () => {
    const content = buildDotenvContent([
      { key: "SECRET", value: "$(rm -rf /) `whoami` #comment" },
    ]);
    expect(content).toBe("SECRET='$(rm -rf /) `whoami` #comment'\n");
  });

  it("joins multiple variables on separate lines", () => {
    const content = buildDotenvContent([
      { key: "A", value: "1" },
      { key: "B", value: "2" },
    ]);
    expect(content).toBe("A='1'\nB='2'\n");
  });

  it("returns an empty string for no variables", () => {
    expect(buildDotenvContent([])).toBe("");
  });
});

describe("run (fetch handler)", () => {
  const inputs: Record<string, string> = {};

  beforeEach(() => {
    inputs.token = "envpk_test_token";
    inputs.environment = "production";
    inputs["api-url"] = "https://www.envpilot.dev";
    inputs["export-env"] = "true";
    inputs["env-file"] = "";

    vi.spyOn(core, "getInput").mockImplementation(
      (name: string) => inputs[name] ?? ""
    );
    vi.spyOn(core, "setSecret").mockImplementation(() => {});
    vi.spyOn(core, "exportVariable").mockImplementation(() => {});
    vi.spyOn(core, "setOutput").mockImplementation(() => {});
    vi.spyOn(core, "setFailed").mockImplementation(() => {});
    vi.spyOn(core, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("masks values before exporting, then reports the summary", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          project: { name: "Acme", slug: "acme" },
          environment: "production",
          variables: [
            { key: "DB_URL", value: "postgres://secret" },
            { key: "EMPTY_VAR", value: "" },
          ],
        }),
        { status: 200 }
      )
    );

    await run();

    expect(core.setFailed).not.toHaveBeenCalled();

    // setSecret must run for every non-empty value, and — critically —
    // before any exportVariable call.
    const secretCall = vi.mocked(core.setSecret).mock.invocationCallOrder[0];
    const exportCall = vi.mocked(core.exportVariable).mock
      .invocationCallOrder[0];
    expect(secretCall).toBeLessThan(exportCall);
    expect(core.setSecret).toHaveBeenCalledWith("postgres://secret");
    expect(core.setSecret).toHaveBeenCalledTimes(1); // empty value skipped

    expect(core.exportVariable).toHaveBeenCalledWith(
      "DB_URL",
      "postgres://secret"
    );
    expect(core.exportVariable).toHaveBeenCalledWith("EMPTY_VAR", "");
    expect(core.setOutput).toHaveBeenCalledWith("count", 2);
    expect(core.info).toHaveBeenCalledWith(
      "Envpilot: pulled 2 variables from Acme (production)"
    );

    // Never logs the token or a variable value in the summary line.
    const infoCalls = vi.mocked(core.info).mock.calls.flat();
    expect(infoCalls.join(" ")).not.toContain("envpk_test_token");
    expect(infoCalls.join(" ")).not.toContain("postgres://secret");
  });

  it("fails with the server's error message on 401", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Invalid or revoked service token" }),
        {
          status: 401,
        }
      )
    );

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      "Envpilot: Invalid or revoked service token"
    );
    expect(core.setSecret).not.toHaveBeenCalled();
    expect(core.exportVariable).not.toHaveBeenCalled();
  });

  it("fails with the server's error message on 403 (wrong env scope)", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'This token is not scoped to the "staging" environment',
        }),
        { status: 403 }
      )
    );

    await run();

    expect(core.setFailed).toHaveBeenCalledWith(
      'Envpilot: This token is not scoped to the "staging" environment'
    );
  });

  it("never includes the token in the failure message", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ error: "Invalid or revoked service token" }),
        {
          status: 401,
        }
      )
    );

    await run();

    const failMessage = vi.mocked(core.setFailed).mock.calls[0]?.[0];
    expect(String(failMessage)).not.toContain("envpk_test_token");
  });
});
