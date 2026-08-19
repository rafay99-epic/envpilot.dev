import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

/**
 * Guards the shape of the dashboard's static shell.
 *
 * The layout hands its session lookup to the client as a promise instead of
 * awaiting it, which is what lets the sidebar and chrome prerender. That is
 * easy to undo by accident — one `await cookies()` added to the layout, or a
 * `usePathname()` call escaping its <Suspense> boundary in a shared nav
 * component, and every dashboard route silently goes back to rendering on
 * demand with nothing on screen until the server answers.
 *
 * `instant()` holds the navigation at the shell so these assertions run
 * against exactly what a user sees on click, before any data arrives.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("instant navigation", () => {
  test("the dashboard shell paints before its data arrives", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });

    await instant(page, async () => {
      await page
        .getByRole("link", { name: /^Projects$/ })
        .first()
        .click();

      // The chrome is in the prerendered shell, so it is on screen with the
      // click rather than after the session resolves.
      await expect(page.getByRole("main")).toBeVisible();
      await expect(
        page.getByRole("link", { name: /envpilot/i }).first()
      ).toBeVisible();
    });

    await expect(page).toHaveURL(/\/dashboard\/projects/);
    expect(clientErrors).toEqual([]);
  });

  test("a project route keeps its shell even with a dynamic segment", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const clientErrors = trackClientErrors(page);

    await page.goto("/dashboard/projects", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("main")).toBeVisible({ timeout: 20_000 });

    // Any project card; "new" is the one /dashboard/projects/* link that
    // isn't a [slug] route.
    const projectLink = page
      .locator('a[href^="/dashboard/projects/"]:not([href$="/new"])')
      .first();

    test.skip(
      (await projectLink.count()) === 0,
      "no project fixture available on this account"
    );

    await instant(page, async () => {
      await projectLink.click();
      // /dashboard/projects/[slug] is where the nav's own pathname read used
      // to force the whole route to render per request.
      await expect(page.getByRole("main")).toBeVisible();
    });

    expect(clientErrors).toEqual([]);
  });
});
