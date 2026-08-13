import { expect, test } from "@playwright/test";

// Unauthenticated e2e — the liveness probe at GET /api/health.
// An external uptime monitor polls this SIGNED OUT and asserts a 200, so it
// must (a) be public (never a WorkOS redirect), (b) report a status code that
// agrees with its own dependency checks, and (c) never leak infra detail.
// A regression here either blinds the status page or fakes a green one.

type Health = {
  status: "ok" | "degraded";
  version: string;
  commit: string | null;
  checks: { convex: { ok: boolean; ms: number } };
};

test.describe("GET /api/health", () => {
  test("is public and returns JSON, not a WorkOS redirect", async ({
    request,
  }) => {
    const response = await request.get("/api/health", { maxRedirects: 0 });
    expect([200, 503]).toContain(response.status());
    expect(response.headers()["content-type"]).toContain("application/json");
  });

  test("status code agrees with the dependency checks", async ({ request }) => {
    const response = await request.get("/api/health");
    const body: Health = await response.json();

    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(typeof body.checks.convex.ok).toBe("boolean");

    // The whole point of the endpoint: a failing dependency must surface as a
    // non-200, or the monitor reports green through an outage.
    if (body.checks.convex.ok) {
      expect(response.status()).toBe(200);
      expect(body.status).toBe("ok");
    } else {
      expect(response.status()).toBe(503);
      expect(body.status).toBe("degraded");
    }
  });

  test("never leaks dependency error detail", async ({ request }) => {
    const raw = await (await request.get("/api/health")).text();

    // Booleans and latency only — no stack traces, URLs, or driver messages.
    expect(raw).not.toMatch(/convex\.cloud|stack|Error:|ECONN|at \w+ \(/i);
  });
});
