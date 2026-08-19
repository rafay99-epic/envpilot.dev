import { expect, test } from "@playwright/test";
import { instant } from "@next/playwright";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { trackClientErrors } from "./support";

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

    const projectLink = page
      .locator('a[href^="/dashboard/projects/"]:not([href$="/new"])')
      .first();

    test.skip(
      (await projectLink.count()) === 0,
      "no project fixture available on this account"
    );

    await instant(page, async () => {
      await projectLink.click();
      await expect(page.getByRole("main")).toBeVisible();
    });

    expect(clientErrors).toEqual([]);
  });
});
