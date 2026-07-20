import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

// Authenticated e2e — Slack/Discord notification webhooks: add a manual
// webhook through the real org settings UI, verify masked display, edit its
// event subscriptions, pause/resume, then remove it.
//
// The OAuth connect flow (Connect Slack / Connect Discord buttons) cannot be
// automated — it requires a real platform consent screen — and the buttons
// only render when the server has OAuth apps configured. This spec covers
// the manual path, which shares every backend surface except URL acquisition.
//
// Serial: later tests operate on the webhook created by the first one; the
// last test removes it, keeping reruns clean.

test.skip(!hasE2ECredentials, SKIP_REASON);

const FAKE_SLACK_URL = `https://hooks.slack.com/services/E2E/TEST/${Date.now()}`;

async function openIntegrationsTab(page: Page, orgSlug: string) {
  await page.goto(`/organizations/${orgSlug}/settings`, {
    waitUntil: "domcontentloaded",
  });
  await expect(
    page.getByRole("button", { name: /^General$/i }).first()
  ).toBeVisible({ timeout: 20_000 });

  const tab = page.getByRole("button", { name: /^Integrations$/i }).first();
  const tabVisible = await tab
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !tabVisible,
    "Integrations tab not visible — not the org owner in this run"
  );
  await tab.click();

  // The section is tier-gated (team_notifications) — the manual-add button
  // only renders inside an allowed FeatureGate.
  const addButton = page.getByTestId("add-webhook-manually");
  const gateOpen = await addButton
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    !gateOpen,
    "team_notifications is gated off for this org/tier — Pro-only feature"
  );
}

test.describe.serial("Notification webhooks", () => {
  const webhookName = `E2E Webhook ${Date.now()}`;
  let orgSlug = "";

  test("rejects an invalid webhook URL", async ({ page }) => {
    test.setTimeout(120_000);
    orgSlug = await getOwnedOrgSlug(page);
    await openIntegrationsTab(page, orgSlug);

    await page.getByTestId("add-webhook-manually").click();
    await page.getByPlaceholder("#eng-alerts").fill(webhookName);
    // A Discord URL while the Slack type is selected must be refused
    await page
      .getByPlaceholder("https://hooks.slack.com/services/...")
      .fill("https://discord.com/api/webhooks/123/abc");
    await page.getByRole("button", { name: /^Add Webhook$/i }).click();

    await expect(
      page.getByText(/Slack webhook URLs start with/i),
      "backend URL validation should surface as a readable error"
    ).toBeVisible({ timeout: 10_000 });
  });

  test("adds a manual Slack webhook and masks its URL", async ({ page }) => {
    test.setTimeout(120_000);
    const clientErrors = trackClientErrors(page);
    await openIntegrationsTab(page, orgSlug);

    await page.getByTestId("add-webhook-manually").click();
    await page.getByPlaceholder("#eng-alerts").fill(webhookName);
    await page
      .getByPlaceholder("https://hooks.slack.com/services/...")
      .fill(FAKE_SLACK_URL);

    // Variables + Requests are the pre-checked defaults
    const checkboxes = page
      .getByTestId("manual-webhook-form")
      .locator('input[type="checkbox"]');
    await expect(checkboxes.nth(0)).toBeChecked(); // variables
    await expect(checkboxes.nth(1)).toBeChecked(); // requests
    await expect(checkboxes.nth(2)).not.toBeChecked(); // members
    await expect(checkboxes.nth(3)).not.toBeChecked(); // security

    await page.getByRole("button", { name: /^Add Webhook$/i }).click();

    await expect(
      page.getByText(/Webhook added/i),
      "a success notice should confirm the webhook was created"
    ).toBeVisible({ timeout: 10_000 });

    // Row appears with name + type badge + subscribed groups
    const row = page.getByText(webhookName).first();
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/variables, requests/i)).toBeVisible();

    // The raw webhook URL must never reach the DOM — only a masked preview
    const pageContent = await page.content();
    expect(
      pageContent.includes(FAKE_SLACK_URL),
      "raw webhook URL must not appear anywhere in the page"
    ).toBe(false);
    await expect(page.getByText(/hooks\.slack\.com\/••••/)).toBeVisible();

    expect(
      clientErrors,
      `unexpected client-side errors: ${clientErrors.join("\n")}`
    ).toHaveLength(0);
  });

  test("edits event subscriptions", async ({ page }) => {
    test.setTimeout(120_000);
    await openIntegrationsTab(page, orgSlug);

    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Events$/i }).click();

    // The inline editor pre-fills the current groups; add Members
    const memberBox = page
      .locator("label")
      .filter({ hasText: "Members" })
      .locator('input[type="checkbox"]')
      .last();
    await memberBox.check();
    await page.getByRole("button", { name: /^Save$/i }).click();

    await expect(page.getByText(/Event subscriptions updated/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/variables, requests, members/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("pauses and resumes the webhook", async ({ page }) => {
    test.setTimeout(120_000);
    await openIntegrationsTab(page, orgSlug);

    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^Pause$/i }).click();
    await expect(page.getByText(/Webhook paused/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /^Resume$/i }).click();
    await expect(page.getByText(/Webhook re-enabled/i)).toBeVisible({
      timeout: 10_000,
    });
  });

  test("removes the webhook", async ({ page }) => {
    test.setTimeout(120_000);
    await openIntegrationsTab(page, orgSlug);

    await expect(page.getByText(webhookName)).toBeVisible({ timeout: 10_000 });
    await page.getByTitle("Remove webhook").click();
    await expect(page.getByText(/Remove .*\?/i)).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("button", { name: /^Remove$/i })
      .last()
      .click();

    await expect(page.getByText(/Webhook removed/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(webhookName)).toHaveCount(0, {
      timeout: 10_000,
    });
  });
});
