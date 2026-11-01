import { expect, test } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON, STORAGE_STATE_PATH } from "../env";
import { getWorkerProjectSlug, trackClientErrors } from "./support";

/**
 * Authenticated e2e: project documentation through the real dashboard.
 *
 *   1. A page created in the dashboard starts as a draft.
 *   2. An unlimited plan shows no page-count ceiling.
 *   3. Publishing in the dashboard flips the page to published.
 *
 * Agent access to these pages goes through the MCP server with an OAuth
 * sign-in, which needs a browser login and is checked by hand (see
 * mcp.spec.ts for what is automated).
 *
 * Serial: later tests reuse the page the first one creates.
 */

test.skip(!hasE2ECredentials, SKIP_REASON);

const APP_ORIGIN = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const STAMP = Date.now();
const MODULE_NAME = `E2E Docs ${STAMP}`;
const UI_TITLE = `E2E UI Page ${STAMP}`;

test.describe.serial("Project documentation", () => {
  let projectSlug = "";
  let uiDocSlug = "";

  test("create a page in the dashboard — it starts as a draft", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);

    projectSlug = await getWorkerProjectSlug(page);

    await page.goto(`/dashboard/projects/${projectSlug}/docs`, {
      waitUntil: "domcontentloaded",
    });

    // Pro-tier e2e account, so the feature gate should let us straight in.
    const newButton = page.getByTestId("doc-new");
    await expect(newButton).toBeVisible({ timeout: 15_000 });
    await newButton.click();

    await page.getByTestId("doc-title-input").fill(UI_TITLE);
    await page.getByTestId("doc-module-input").fill(MODULE_NAME);
    await page.getByTestId("doc-type-guide").click();
    await page.getByTestId("doc-create-submit").click();

    // Lands on the page view, in draft, with the review bar explaining why
    // nobody else can see it yet.
    await expect(page.getByTestId("doc-title")).toHaveText(UI_TITLE, {
      timeout: 20_000,
    });
    await expect(page.getByTestId("doc-review-bar")).toContainText(/draft/i);
    await expect(page.getByTestId("doc-publish")).toBeVisible();

    uiDocSlug = new URL(page.url()).pathname.split("/").pop() ?? "";
    expect(uiDocSlug.length).toBeGreaterThan(0);

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  test("an unlimited plan shows no page-count ceiling", async ({ page }) => {
    // The caps are numeric registry values, so "unlimited" is a null the UI
    // has to read as unlimited rather than as zero — which would hide New
    // Page on a Pro org and block the whole feature.
    await page.goto(`/dashboard/projects/${projectSlug}/docs`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("doc-new")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("doc-limit-banner")).toHaveCount(0);

    await page.goto(`/dashboard/projects/${projectSlug}/docs/new`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByTestId("doc-title-input")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("doc-new-blocked")).toHaveCount(0);
  });

  test("publishing in the dashboard publishes the page", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!uiDocSlug, "no page from the create test");
    const clientErrors = trackClientErrors(page);

    await page.goto(`/dashboard/projects/${projectSlug}/docs/${uiDocSlug}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByTestId("doc-publish").click();
    await expect(page.getByTestId("doc-review-bar")).toContainText(
      /published/i,
      { timeout: 20_000 }
    );

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toEqual([]);
  });

  // Cleanup as a hook, not a final test: serial mode skips every case after
  // a failure, which would leak stale pages into each rerun. afterAll only sees worker-scoped fixtures, so it opens its own
  // authenticated context.
  test.afterAll(async ({ browser }) => {
    test.setTimeout(120_000);
    if (!hasE2ECredentials || !projectSlug) return;

    // Delete every page this spec created so reruns stay green.
    const context = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
      baseURL: APP_ORIGIN,
    });
    const page = await context.newPage();
    try {
      await page.goto(`/dashboard/projects/${projectSlug}/docs`, {
        waitUntil: "domcontentloaded",
      });

      for (const title of [UI_TITLE]) {
        const row = page
          .locator('[data-testid^="doc-row-"]')
          .filter({ hasText: title });
        if ((await row.count()) === 0) continue;
        await row.first().click();
        await expect(page.getByTestId("doc-title")).toHaveText(title, {
          timeout: 20_000,
        });
        await page.getByTestId("doc-delete").click();
        await page.getByRole("button", { name: /move to trash/i }).click();
        await page.waitForURL(`**/projects/${projectSlug}/docs`, {
          timeout: 20_000,
        });
      }
    } finally {
      await context.close();
    }
  });
});
