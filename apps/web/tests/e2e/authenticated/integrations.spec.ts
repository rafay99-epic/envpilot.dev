import { expect, test, type Page } from "@playwright/test";

import { hasE2ECredentials, SKIP_REASON } from "../env";
import { getOwnedOrgSlug, trackClientErrors } from "./support";

test.skip(!hasE2ECredentials, SKIP_REASON);

const webhookUrl = process.env.E2E_NOTIFICATION_WEBHOOK_URL;
const webhookType =
  webhookUrl?.includes("discord.com/api/webhooks/") ||
  webhookUrl?.includes("discordapp.com/api/webhooks/")
    ? "discord"
    : "slack";

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
    "Integrations tab not visible — this run is not an organization owner"
  );
  await tab.click();

  const addButton = page.getByTestId("add-webhook-manually");
  const gateOpen = await addButton
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(!gateOpen, "team_notifications is gated off for this org/tier");
}

function webhookRow(page: Page, name: string) {
  return page.getByTestId("webhook-row").filter({ hasText: name });
}

// DOM traces can snapshot a capability URL while the manual form is filled.
test.use({ trace: "off" });

test.describe("Notification webhooks", () => {
  test("rejects a cross-provider webhook URL", async ({ page }) => {
    test.setTimeout(120_000);
    await openIntegrationsTab(page, await getOwnedOrgSlug(page));

    await page.getByTestId("add-webhook-manually").click();
    await page.getByPlaceholder("#eng-alerts").fill("Invalid E2E Webhook");
    await page
      .getByPlaceholder("https://hooks.slack.com/services/...")
      .fill("https://discord.com/api/webhooks/123/abc");
    await page.getByRole("button", { name: /^Add Webhook$/i }).click();

    await expect(
      page.getByText(/Enter a Slack Incoming Webhook URL/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("runs the real webhook lifecycle", async ({ page }) => {
    test.skip(
      !webhookUrl,
      "Set E2E_NOTIFICATION_WEBHOOK_URL to a disposable real Slack or Discord webhook"
    );
    const configuredWebhookUrl = webhookUrl!;
    test.setTimeout(180_000);
    const clientErrors = trackClientErrors(page);
    const webhookName = `E2E Webhook ${Date.now()}`;
    await openIntegrationsTab(page, await getOwnedOrgSlug(page));

    try {
      await page.getByTestId("add-webhook-manually").click();
      if (webhookType === "discord") {
        await page.getByRole("button", { name: /^discord$/i }).click();
      }
      const form = page.getByTestId("manual-webhook-form");
      await form.getByPlaceholder("#eng-alerts").fill(webhookName);
      await form
        .getByPlaceholder(
          webhookType === "discord"
            ? "https://discord.com/api/webhooks/..."
            : "https://hooks.slack.com/services/..."
        )
        .fill(configuredWebhookUrl);

      await expect(
        form.getByRole("checkbox", { name: /Variables/i })
      ).toBeChecked();
      await expect(
        form.getByRole("checkbox", { name: /Requests/i })
      ).toBeChecked();
      await expect(
        form.getByRole("checkbox", { name: /Members/i })
      ).not.toBeChecked();
      await expect(
        form.getByRole("checkbox", { name: /Security/i })
      ).not.toBeChecked();

      await form.getByRole("button", { name: /^Add Webhook$/i }).click();
      await expect(page.getByText(/Webhook added.*queued/i)).toBeVisible({
        timeout: 20_000,
      });

      const row = webhookRow(page, webhookName);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row).toContainText("variables, requests");
      await expect(row).toContainText("last sent", { timeout: 45_000 });
      expect(
        (await page.content()).includes(configuredWebhookUrl),
        "the webhook capability URL must not be rendered after submission"
      ).toBe(false);

      await row.getByRole("button", { name: /^Events$/i }).click();
      await row.getByRole("checkbox", { name: /Members/i }).check();
      await row.getByRole("button", { name: /^Save$/i }).click();
      await expect(row).toContainText("variables, requests, members");

      await row.getByRole("button", { name: /^Pause$/i }).click();
      await expect(page.getByText(/Webhook paused/i)).toBeVisible();
      await row.getByRole("button", { name: /^Resume$/i }).click();
      await expect(page.getByText(/Webhook re-enabled/i)).toBeVisible();

      const previousDelivery = await row.getAttribute("data-last-sent-at");
      expect(previousDelivery).toBeTruthy();
      await row.getByTitle("Send test message").click();
      await expect(page.getByText(/Test message queued/i)).toBeVisible();
      await expect
        .poll(() => row.getAttribute("data-last-sent-at"), {
          timeout: 45_000,
          message: "test delivery should complete successfully",
        })
        .not.toBe(previousDelivery);

      await row.getByTitle("Remove webhook").click();
      const dialog = page.getByRole("dialog", {
        name: `Remove ${webhookName}`,
      });
      await dialog.getByRole("button", { name: /^Remove$/i }).click();
      await expect(row).toHaveCount(0, { timeout: 20_000 });

      expect(
        clientErrors,
        `unexpected client-side errors: ${clientErrors.join("\n")}`
      ).toHaveLength(0);
    } finally {
      const row = webhookRow(page, webhookName);
      if ((await row.count()) > 0) {
        await row
          .getByTitle("Remove webhook")
          .click()
          .catch(() => {});
        await page
          .getByRole("dialog", { name: `Remove ${webhookName}` })
          .getByRole("button", { name: /^Remove$/i })
          .click()
          .catch(() => {});
      }
    }
  });
});
