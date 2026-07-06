import { expect, test } from "@playwright/test";

// Unauthenticated e2e — the release-version manifest at GET /api/version.
// Clients (CLI, extension, web boot) poll this SIGNED OUT to decide update /
// hard-block enforcement, so it must (a) be public (never a WorkOS redirect)
// and (b) always carry both the latest and the minimum-supported version for
// the CLI and extension. A regression here silently disables enforcement.

/** Numeric x.y.z (pre-release suffixes allowed). */
const SEMVER = /^\d+\.\d+\.\d+/;

function compare(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .split("-")[0]
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

test.describe("GET /api/version", () => {
  test("is public and returns JSON, not a WorkOS redirect", async ({
    request,
  }) => {
    const response = await request.get("/api/version", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("exposes latest + minimum for both CLI and extension", async ({
    request,
  }) => {
    const body = await (await request.get("/api/version")).json();

    for (const key of ["cli", "extension", "minCli", "minExtension"] as const) {
      expect(body[key], `missing ${key}`).toMatch(SEMVER);
    }

    // Minimum must never exceed latest, or every client would be hard-blocked.
    expect(compare(body.minCli, body.cli)).toBeLessThanOrEqual(0);
    expect(compare(body.minExtension, body.extension)).toBeLessThanOrEqual(0);
  });
});
