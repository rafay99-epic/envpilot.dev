import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";
import { buildDotenv } from "./dotenv.js";

describe("parseArgs", () => {
  it("parses a runtime exec invocation", () => {
    const args = parseArgs([
      "exec",
      "--project",
      "checkout",
      "-e",
      "production",
      "--files",
      "--",
      "node",
      "server.js",
    ]);
    expect(args).toMatchObject({
      command: "exec",
      project: "checkout",
      env: "production",
      withFiles: true,
      rest: ["node", "server.js"],
    });
  });

  it("keeps flags belonging to the child command after --", () => {
    const args = parseArgs(["exec", "--", "npm", "run", "build", "--", "-q"]);
    expect(args.rest).toEqual(["npm", "run", "build", "--", "-q"]);
    expect(args.quiet).toBe(false);
  });

  it("requires a command after exec --", () => {
    expect(() => parseArgs(["exec", "-p", "checkout"])).toThrow(
      /needs a command/
    );
  });

  it("rejects an unknown command and an unknown flag", () => {
    expect(() => parseArgs(["yolo"])).toThrow(/Unknown command/);
    expect(() => parseArgs(["pull", "--nope"])).toThrow(/Unknown flag/);
  });

  it("rejects a value flag with no value", () => {
    expect(() => parseArgs(["pull", "--project"])).toThrow(/needs a value/);
    expect(() => parseArgs(["pull", "--project", "--env"])).toThrow(
      /needs a value/
    );
  });

  it("defaults withFiles and quiet to false", () => {
    expect(parseArgs(["pull"])).toMatchObject({
      withFiles: false,
      quiet: false,
    });
  });
});

describe("buildDotenv", () => {
  it("quotes every value so spaces and comments survive sourcing", () => {
    expect(
      buildDotenv([{ key: "MSG", value: "hello world # not a comment" }])
    ).toBe("MSG='hello world # not a comment'\n");
  });

  it("escapes embedded single quotes", () => {
    expect(buildDotenv([{ key: "K", value: "it's" }])).toBe("K='it'\\''s'\n");
  });

  it("keeps a multi-line value on one logical assignment", () => {
    const out = buildDotenv([
      { key: "PEM", value: "-----BEGIN-----\nabc\n-----END-----" },
    ]);
    expect(out).toBe("PEM='-----BEGIN-----\nabc\n-----END-----'\n");
  });

  it("returns empty text for no variables", () => {
    expect(buildDotenv([])).toBe("");
  });
});
