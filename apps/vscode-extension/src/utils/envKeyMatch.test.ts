import { describe, it, expect } from "vitest";
import { findEnvKeyMatches } from "./envKeyMatch";

describe("findEnvKeyMatches", () => {
  it("returns [] for unknown languages", () => {
    expect(findEnvKeyMatches("cobol", "process.env.API_KEY")).toEqual([]);
  });

  it("matches a dot reference in javascript", () => {
    const line = "const key = process.env.API_KEY;";
    expect(findEnvKeyMatches("javascript", line)).toEqual([
      {
        key: "API_KEY",
        start: line.indexOf("API_KEY"),
        end: line.indexOf("API_KEY") + 7,
      },
    ]);
  });

  it("matches a bracket reference in javascript", () => {
    const line = 'const key = process.env["API_KEY"];';
    const start = line.indexOf("API_KEY");
    expect(findEnvKeyMatches("javascript", line)).toEqual([
      { key: "API_KEY", start, end: start + 7 },
    ]);
  });

  it("anchors each match to its own occurrence when the same key appears twice on one line", () => {
    const line =
      "const a = process.env.API_KEY; const b = process.env.API_KEY;";
    const matches = findEnvKeyMatches("javascript", line);
    expect(matches).toHaveLength(2);
    // Upstream used line.indexOf(key), which put BOTH ranges on the first
    // occurrence. Each range must cover its own occurrence.
    expect(matches[0]).toEqual({ key: "API_KEY", start: 22, end: 29 });
    expect(matches[1]).toEqual({ key: "API_KEY", start: 53, end: 60 });
    expect(matches[1].start).toBeGreaterThan(matches[0].end);
  });

  it("is not fooled by the key appearing earlier in the line as plain text", () => {
    const line = '"API_KEY" + process.env.API_KEY';
    const matches = findEnvKeyMatches("javascript", line);
    expect(matches).toEqual([{ key: "API_KEY", start: 24, end: 31 }]);
  });

  it("matches python environ.get, environ[] and getenv", () => {
    expect(findEnvKeyMatches("python", 'os.environ.get("DB_URL")')).toEqual([
      { key: "DB_URL", start: 16, end: 22 },
    ]);
    expect(findEnvKeyMatches("python", "os.environ['DB_URL']")).toEqual([
      { key: "DB_URL", start: 12, end: 18 },
    ]);
    expect(findEnvKeyMatches("python", 'os.getenv("DB_URL")')).toEqual([
      { key: "DB_URL", start: 11, end: 17 },
    ]);
  });

  it("matches php $_ENV and getenv", () => {
    expect(findEnvKeyMatches("php", '$_ENV["DB_URL"]')).toEqual([
      { key: "DB_URL", start: 7, end: 13 },
    ]);
    expect(findEnvKeyMatches("php", "getenv('DB_URL')")).toEqual([
      { key: "DB_URL", start: 8, end: 14 },
    ]);
  });

  it("matches go, java, csharp and rust forms", () => {
    expect(findEnvKeyMatches("go", 'os.Getenv("DB_URL")')).toHaveLength(1);
    expect(findEnvKeyMatches("java", 'dotenv.get("DB_URL")')).toHaveLength(1);
    expect(
      findEnvKeyMatches(
        "csharp",
        'Environment.GetEnvironmentVariable("DB_URL")'
      )
    ).toHaveLength(1);
    expect(findEnvKeyMatches("rust", 'std::env::var("DB_URL")')).toHaveLength(
      1
    );
    expect(
      findEnvKeyMatches("rust", 'std::env::var_os("DB_URL")')
    ).toHaveLength(1);
  });

  it("matches ruby ENV[]", () => {
    expect(findEnvKeyMatches("ruby", "ENV['DB_URL']")).toEqual([
      { key: "DB_URL", start: 5, end: 11 },
    ]);
  });
});
