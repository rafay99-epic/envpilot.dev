import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

/**
 * Smoke / stress tests for the auth error boundary feature.
 *
 * Verifies:
 *   1. Healthy dashboard renders correctly (no false positives from boundary)
 *   2. Corrupted/missing sessions redirect to WorkOS (not broken dashboard shell)
 *   3. Error boundary catches auth errors without crashing the entire app
 *   4. Contact support renders with the correct email
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

/**
 * Known pre-existing transient: on a fresh page load the Convex client can
 * fire queries before the WorkOS identity is attached to the socket, yielding
 * a self-healing "Unauthenticated" server error that the dashboard error
 * boundary auto-retries past. It predates the auth error boundary feature;
 * these specs tolerate exactly this signature and still fail on anything else
 * — while separately asserting the auth error page never STICKS after it.
 */
const TRANSIENT_AUTH_RACE =
  /Unauthenticated: no verified user identity on request/;

function realErrors(errors: string[]): string[] {
  return errors.filter((e) => !TRANSIENT_AUTH_RACE.test(e));
}

test.describe("AuthErrorBoundary — smoke / stress", () => {
  test("healthy dashboard renders shell without auth error page (negative test)", async ({
    page,
  }) => {
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Sidebar must render
    await expect(page.locator("aside").first()).toBeVisible({
      timeout: 20_000,
    });

    // The auth error page must NOT appear on a healthy session
    await expect(page.getByText("ERROR: Authentication Error")).not.toBeVisible(
      { timeout: 10_000 }
    );
    await expect(page.getByText("support@envpilot.dev")).not.toBeVisible({
      timeout: 10_000,
    });

    expect(realErrors(clientErrors)).toEqual([]);
  });

  test("corrupted session redirects to WorkOS sign-in, not broken dashboard", async ({
    page,
    context,
  }) => {
    // Sign in first so we have real cookies to corrupt
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.locator("aside").first()).toBeVisible({
      timeout: 20_000,
    });

    // Wipe the session by clearing all cookies and setting a dummy one
    // that won't match any valid WorkOS session. `addCookies` rejects some
    // domain/path combos from existing cookies, so we clear first.
    await context.clearCookies();
    await context.addCookies([
      {
        name: "wos-session-test",
        value: "definitely-not-a-real-session",
        domain: "localhost",
        path: "/",
      },
    ]);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // Must NOT render the dashboard shell (would be a broken empty shell)
    await expect(page.locator("aside").first()).not.toBeVisible({
      timeout: 15_000,
    });

    // Must redirect to WorkOS (existing behavior preserved)
    expect(page.url()).not.toContain("/dashboard");
    expect(page.url()).not.toContain("localhost:3000");
  });

  test("missing session redirects to WorkOS sign-in", async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });

    // No dashboard shell
    await expect(page.locator("aside").first()).not.toBeVisible({
      timeout: 15_000,
    });

    // No auth error page (it's for failures, not missing sessions)
    await expect(page.getByText("ERROR: Authentication Error")).not.toBeVisible(
      { timeout: 10_000 }
    );

    // Redirected to WorkOS sign-in
    expect(page.url()).not.toContain("localhost:3000");
  });

  test("rapid navigation across dashboard pages never triggers auth error on healthy session", async ({
    page,
  }) => {
    // Navigate to dashboard once to establish session
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.locator("aside").first()).toBeVisible({
      timeout: 20_000,
    });

    // Rapidly navigate across 10 different dashboard pages within one session
    const paths = [
      "/dashboard",
      "/dashboard/projects",
      "/organizations",
      "/dashboard/audit",
      "/dashboard/variables",
    ];

    for (let i = 0; i < 10; i++) {
      await page.goto(paths[i % paths.length], {
        waitUntil: "domcontentloaded",
      });

      // Every page must show the sidebar (auth is intact)
      await expect(page.locator("aside").first()).toBeVisible({
        timeout: 10_000,
      });

      // Auth error page must never appear
      await expect(
        page.getByText("ERROR: Authentication Error")
      ).not.toBeVisible({ timeout: 5_000 });
    }
  });

  test("error boundary does not interfere with non-auth errors", async ({
    page,
    context,
  }) => {
    // Navigate to a non-existent page to trigger 404
    const response = await page.goto(
      "/this-path-definitely-does-not-exist-12345",
      { waitUntil: "domcontentloaded" }
    );

    // Must get a 404, not an auth error page
    expect(response?.status()).toBe(404);
    await expect(page.getByText("ERROR: Authentication Error")).not.toBeVisible(
      { timeout: 10_000 }
    );
  });

  test("no spurious client errors on core pages", async ({ page }) => {
    const pages = [
      "/dashboard",
      "/dashboard/projects",
      "/dashboard/variables",
      "/organizations",
      "/dashboard/audit",
    ];

    const errors = trackClientErrors(page);

    for (const path of pages) {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1_000);

      // The transient auth race must self-heal — the auth error page
      // sticking here would be a real boundary regression.
      await expect(
        page.getByText("ERROR: Authentication Error")
      ).not.toBeVisible({ timeout: 10_000 });

      expect(
        realErrors(errors),
        `${path} should have zero client errors`
      ).toEqual([]);
    }
  });
});
