import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

// Public pages must not check the session. Every check is a billed Vercel
// function call: AuthKitProvider's server actions (on mount, focus and token
// refresh) and the old header's /api/auth/me fetch. Runs signed in, because a
// session cookie is what used to make those calls worth making.

test.skip(!hasE2ECredentials, SKIP_REASON);

const PUBLIC_PAGES = ["/", "/pricing", "/faq", "/changelog"] as const;

/** Records server-action POSTs and /api/auth/me fetches made by the page. */
function trackAuthCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (request.method() === "POST" && request.headers()["next-action"]) {
      calls.push(`server action on ${pathname}`);
    } else if (pathname === "/api/auth/me") {
      calls.push("GET /api/auth/me");
    }
  });
  return calls;
}

test.describe("public pages skip auth", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} makes no auth calls, even on tab focus`, async ({ page }) => {
      const authCalls = trackAuthCalls(page);
      const clientErrors = trackClientErrors(page);

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("link", { name: "sign-in" })).toBeVisible();

      // AuthKitProvider re-checked the session on these two events.
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // Proving an absence needs a settle window; the old calls fired
      // within a few hundred ms of hydration and of each event.
      await page.waitForTimeout(2_000);

      expect(authCalls).toEqual([]);
      expect(clientErrors).toEqual([]);
    });
  }

  test("sign-in from a public page takes a signed-in user to the dashboard", async ({
    page,
  }) => {
    await page.goto("/pricing", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "sign-in" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });
  });

  test("the dashboard still attaches the session to Convex", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const clientErrors = trackClientErrors(page);

    const slug = await getWorkerProjectSlug(page);
    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByRole("heading", { name: "Environment Variables" })
    ).toBeVisible({ timeout: 20_000 });

    expect(clientErrors).toEqual([]);
  });
});
