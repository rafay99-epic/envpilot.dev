import { expect, test } from "@playwright/test";

// Unified RBAC — unauthenticated access to the pages that ship the new role
// system. There is no authenticated e2e infrastructure in this repo (no
// storage state / test users), so these specs pin down the middleware
// behavior: every RBAC surface must redirect signed-out visitors to the
// WorkOS AuthKit sign-in flow and preserve the return path.

const WORKOS_AUTHORIZE = /api\.workos\.com\/user_management\/authorize/;

/** Decode the AuthKit `state` param, which carries the post-login return path. */
function returnPathnameFromLocation(location: string): string | undefined {
  const state = new URL(location).searchParams.get("state");
  if (!state) return undefined;
  const parsed: unknown = JSON.parse(
    Buffer.from(state, "base64").toString("utf-8")
  );
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "returnPathname" in parsed &&
    typeof parsed.returnPathname === "string"
  ) {
    return parsed.returnPathname;
  }
  return undefined;
}

test.describe("unified RBAC pages require authentication", () => {
  const protectedPaths = [
    "/organizations/acme/members",
    "/dashboard/projects/acme/members",
    "/dashboard",
  ];

  for (const path of protectedPaths) {
    test(`redirects signed-out visitors from ${path} to AuthKit sign-in`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect(response.status()).toBe(307);
      const location = response.headers()["location"];
      expect(location).toMatch(WORKOS_AUTHORIZE);
      expect(location).toContain("screen_hint=sign-in");
      // The middleware must remember where the user was headed.
      expect(returnPathnameFromLocation(location)).toBe(path);
    });
  }

  test("browser navigation to the org members page never renders it signed-out", async ({
    page,
  }) => {
    await page.goto("/organizations/acme/members", {
      waitUntil: "commit",
    });
    // We must have been redirected off the members page (to the AuthKit
    // hosted sign-in). Never assert on WorkOS page internals — only that the
    // protected RBAC UI (invite panel, member table) was not reachable.
    expect(page.url()).not.toContain("/organizations/acme/members");
  });

  test("public pages stay reachable without a session", async ({ request }) => {
    for (const path of ["/", "/pricing"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} should be public`).toBe(200);
    }
  });
});
