import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import {
  createVariable,
  deleteVariableByKey,
  getWorkerProjectSlug,
} from "./support";

// Authenticated e2e — per-environment key uniqueness on variable create.
// Same key + OVERLAPPING environments must show the human message
// ("A variable named "X" already exists…") in the drawer's inline error
// banner — never raw backend text. Same key across DISJOINT environments
// (dev copy + prod copy of DATABASE_URL) is a legal, separate variable.

test.skip(!hasE2ECredentials, SKIP_REASON);

test.describe("duplicate variable key feedback", () => {
  test("second create with the same key shows a friendly inline error", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const slug = await getWorkerProjectSlug(page);
    const key = `E2E_DUP_${Date.now()}`;

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    try {
      await createVariable(page, { key, value: "first-value" });

      // Attempt the duplicate through the real drawer. Unlike the helper,
      // this flow EXPECTS the submit to fail and the drawer to stay open.
      await page.getByRole("button", { name: "Add Variable" }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible({ timeout: 10_000 });
      await drawer.locator("#key").fill(key);
      await drawer.locator("#value").fill("second-value");
      await drawer.locator("#value").press("Enter");

      // Friendly message, with the offending key named.
      await expect(
        drawer.getByText(
          new RegExp(`A variable named "${key}" already exists`, "i")
        ),
        "drawer should show the friendly duplicate-key message"
      ).toBeVisible({ timeout: 15_000 });

      // Never the raw backend/Convex error text.
      await expect(page.getByText(/Uncaught Error/i)).toHaveCount(0);

      // Drawer stays open so the user can correct the key.
      await expect(drawer).toBeVisible();
      await page.keyboard.press("Escape");
    } finally {
      await deleteVariableByKey(page, key).catch(() => {});
    }
  });

  test("same key in a DIFFERENT environment creates a separate variable", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const slug = await getWorkerProjectSlug(page);
    const key = `E2E_ENVDUP_${Date.now()}`;

    await page.goto(`/dashboard/projects/${slug}`, {
      waitUntil: "domcontentloaded",
    });

    try {
      // Dev copy first (helper default = development).
      await createVariable(page, { key, value: "dev-value" });

      // Prod copy of the SAME key through the real drawer. The helper can't
      // do this: it skips when a row with the key exists and only toggles
      // environments ON (never off the development default).
      await page.getByRole("button", { name: "Add Variable" }).click();
      const drawer = page.getByRole("dialog");
      await expect(drawer).toBeVisible({ timeout: 10_000 });
      await drawer.locator("#key").fill(key);
      await drawer.locator("#value").fill("prod-value");
      // Move the selection from the development default to production only —
      // disjoint environments, so the create must succeed.
      await drawer
        .getByRole("button", { name: "production", exact: true })
        .click();
      await drawer
        .getByRole("button", { name: "development", exact: true })
        .click();
      await drawer.locator("#value").press("Enter");
      await expect(drawer).not.toBeVisible({ timeout: 15_000 });

      // Both rows exist side by side.
      await expect(page.getByText(key)).toHaveCount(2, { timeout: 15_000 });
    } finally {
      // Two rows share the key — delete both.
      await deleteVariableByKey(page, key).catch(() => {});
      await deleteVariableByKey(page, key).catch(() => {});
    }
  });
});
